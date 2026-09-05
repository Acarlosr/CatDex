import asyncio
import json
import logging
import threading
import time
import uuid
from hashlib import md5
import pandas as pd
import ccxt
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from sqlalchemy import text
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.exc import IntegrityError
from backend.core.database import SessionLocal
from backend.models.bots import BotConfig
from backend.models.candles import Candle
from backend.models.signals import Signal
from backend.models.orders import Order
from backend.models.positions import Position
from backend.models.exchange_keys import ExchangeKey
from backend.engine.evaluator import NodeEvaluator
from backend.core.events import event_bus
from backend.core.encryption import decrypt_data
from backend.core.exchange_registry import build_exchange_from_key
from backend.core import bot_log_buffer as blb

logger = logging.getLogger("apexalgo.bot_manager")

VALID_EXIT_TYPES = {'percentage', 'trailing', 'atr', 'fixed'}

def _indicator_fingerprint(settings):
    """Stable hash of a bot's indicator node configs."""
    nodes = settings.get("nodes", {})
    ind_nodes = {k: v for k, v in sorted(nodes.items()) if v.get("class") == "indicator"}
    return md5(json.dumps(ind_nodes, sort_keys=True).encode()).hexdigest()


def _tf_seconds(timeframe: str) -> int:
    if timeframe.endswith('m'): return int(timeframe[:-1]) * 60
    if timeframe.endswith('h'): return int(timeframe[:-1]) * 3600
    if timeframe.endswith('d'): return int(timeframe[:-1]) * 86400
    if timeframe.endswith('w'): return int(timeframe[:-1]) * 604800
    return 60


def _naive_utc(ts):
    """SQLite stores naive datetimes; normalize any pandas/tz-aware value to
    naive UTC so unique constraints and dedup lookups compare consistently."""
    if ts is None:
        return None
    if hasattr(ts, 'to_pydatetime'):
        ts = ts.to_pydatetime()
    if getattr(ts, 'tzinfo', None) is not None:
        ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
    return ts


class BotManager:
    def __init__(self):
        self.running = False
        self.position_states = {}
        # position_states is mutated from backfill threads and _process_bots
        # worker threads, so a threading lock (not asyncio) guards it
        self._position_states_lock = threading.Lock()
        self._drawdown_cache = {}  # (bot_name, mode_group) -> {peak_pnl, running_pnl, max_dd}
        self._deleted_bots = set()  # bot names pending cleanup, skip in processing
        self._backfilling_bots = set()  # bot names currently in backfill, skip in live processing
        self._candle_locks = defaultdict(asyncio.Lock)  # (exchange, symbol, timeframe) -> serializer
        self._processed_candles = {}  # (exchange, symbol, timeframe) -> last processed candle ts
        self._balance_cache = {}  # (key_name, quote_ccy) -> (fetched_at, free_balance)
        self._bg_tasks = set()  # strong refs so fire-and-forget tasks are not GC'd mid-flight

    def _spawn(self, coro):
        task = asyncio.create_task(coro)
        self._bg_tasks.add(task)
        task.add_done_callback(self._bg_tasks.discard)
        return task

    def _get_drawdown(self, bot_name, db, mode_group="live", starting_capital=1000.0):
        """Return cached drawdown state, lazy-initializing from DB on first access.
        mode_group: "backtest" for backtest-only, "live" for forward_test/paper/live.
        starting_capital: wallet size used as equity base for percentage calculation."""
        cache_key = (bot_name, mode_group)
        if cache_key not in self._drawdown_cache:
            query = db.query(Position.profit_abs).filter(
                Position.bot_name == bot_name, Position.status == "closed"
            )
            if mode_group == "backtest":
                query = query.filter(Position.mode == "backtest")
            else:
                query = query.filter(Position.mode.in_(["forward_test", "paper", "live"]))
            closed = query.order_by(Position.closed_at).all()
            running = 0.0
            peak_equity = starting_capital
            dd = 0.0
            for cp in closed:
                running += (cp.profit_abs or 0)
                equity = starting_capital + running
                peak_equity = max(peak_equity, equity)
                if peak_equity > 0:
                    dd = max(dd, ((peak_equity - equity) / peak_equity) * 100)
            self._drawdown_cache[cache_key] = {"starting_capital": starting_capital, "peak_equity": peak_equity, "running_pnl": running, "max_dd": dd}
        return self._drawdown_cache[cache_key]

    def _update_drawdown(self, bot_name, mode_group, profit_abs):
        """Incrementally update drawdown cache when a position closes."""
        cache_key = (bot_name, mode_group)
        if cache_key in self._drawdown_cache:
            s = self._drawdown_cache[cache_key]
            s["running_pnl"] += (profit_abs or 0)
            equity = s["starting_capital"] + s["running_pnl"]
            s["peak_equity"] = max(s["peak_equity"], equity)
            if s["peak_equity"] > 0:
                s["max_dd"] = max(s["max_dd"], ((s["peak_equity"] - equity) / s["peak_equity"]) * 100)

    async def start(self):
        self.running = True
        logger.info("Bot Manager started. Engine is fully operational.")

        self._spawn(self._startup_backfill())
        self._spawn(self._listen_for_bot_starts())

        queue = event_bus.subscribe("CANDLE_CLOSED")
        while self.running:
            try:
                event_data = await asyncio.wait_for(queue.get(), timeout=1.0)
                exchange = event_data.get("exchange", "okx")
                symbol = event_data["symbol"]
                timeframe = event_data["timeframe"]
                candle_ts = event_data.get("timestamp")
                self._spawn(self._handle_candle_close(exchange, symbol, timeframe, candle_ts))
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    async def _handle_candle_close(self, exchange: str, symbol: str, timeframe: str, candle_ts):
        """Serialize processing per subscription and skip re-published candles.
        Poll tasks re-emit after a reconnect, so the same candle can arrive twice;
        without this, two concurrent runs could place duplicate live orders."""
        key = (exchange, symbol, timeframe)
        async with self._candle_locks[key]:
            if candle_ts is not None:
                prev = self._processed_candles.get(key)
                if prev is not None and candle_ts <= prev:
                    return
            await self._process_bots(exchange, symbol, timeframe)
            if candle_ts is not None:
                self._processed_candles[key] = candle_ts

    def _get_ccxt_instance(self, api_key_record: ExchangeKey):
        return build_exchange_from_key(api_key_record)

    def _reconcile_order(self, ccxt_inst, order, ccxt_symbol, attempts=5, delay=1.0):
        """Market orders often report status open/None on creation even though they
        fill (near-)immediately; poll the exchange until a terminal state is known.
        Returns the freshest order dict available."""
        for _ in range(attempts):
            status = order.get("status")
            if status in ("canceled", "rejected", "expired"):
                break
            if status == "closed" and order.get("filled") is not None:
                break
            order_id = order.get("id")
            if not order_id:
                break
            time.sleep(delay)
            try:
                refreshed = ccxt_inst.fetch_order(order_id, ccxt_symbol)
            except Exception as exc:
                logger.warning("fetch_order %s failed: %s", order_id, exc)
                continue
            if refreshed:
                merged = {k: v for k, v in refreshed.items() if v is not None}
                order = {**order, **merged}
        return order

    def _cancel_unfilled_order(self, ccxt_inst, order_id, ccxt_symbol):
        """Try to cancel an order whose fill state could not be confirmed.
        Returns True when the cancel definitively succeeded (the order did not
        fill), False when the order may still have filled — e.g. cancel raises
        'order not found' or 'already filled' — so the caller must treat the
        order state as unknown instead of silently booking it as canceled."""
        if not order_id:
            # Order never got an exchange id, so nothing on the exchange can fill
            return True
        try:
            ccxt_inst.cancel_order(order_id, ccxt_symbol)
            return True
        except Exception as exc:
            logger.warning("cancel_order %s failed: %s", order_id, exc)
            return False

    @staticmethod
    def _below_market_minimum(ccxt_inst, ccxt_symbol, amount, price):
        """Return a human-readable violation string when an order would fall
        below the exchange's minimum amount/cost limits, else None. Missing
        limit metadata is treated as no restriction."""
        try:
            limits = (ccxt_inst.market(ccxt_symbol) or {}).get("limits") or {}
            min_amount = (limits.get("amount") or {}).get("min")
            min_cost = (limits.get("cost") or {}).get("min")
            if min_amount is not None and amount < float(min_amount):
                return f"amount {amount} below exchange minimum {float(min_amount)}"
            if min_cost is not None and price:
                order_value = amount * float(price)
                if order_value < float(min_cost):
                    return f"order ${order_value:.2f} below exchange minimum ${float(min_cost):.2f}"
        except Exception:
            return None
        return None

    @staticmethod
    def _fee_in_quote(fee_info, ccxt_symbol, price):
        """CCXT fee cost can be denominated in base currency (typical for buys);
        convert to quote so it can be netted against PnL."""
        if not fee_info:
            return 0.0
        try:
            cost = float(fee_info.get("cost", 0) or 0)
        except (TypeError, ValueError):
            return 0.0
        currency = fee_info.get("currency")
        base = ccxt_symbol.split('/')[0] if '/' in ccxt_symbol else None
        if currency and base and currency.upper() == base.upper() and price:
            return cost * float(price)
        return cost

    def _get_live_capital(self, ccxt_inst, api_key_record, ccxt_symbol, bot_name, ttl=30):
        """Free quote-currency balance on the exchange, cached briefly to spare
        rate limits. Returns None when the balance cannot be determined so the
        caller can fall back to the configured capital."""
        quote = ccxt_symbol.split('/')[-1]
        cache_key = (api_key_record.name, quote)
        now = time.monotonic()
        cached = self._balance_cache.get(cache_key)
        if cached and (now - cached[0]) < ttl:
            return cached[1]
        try:
            balance = ccxt_inst.fetch_balance()
            free = None
            if isinstance(balance.get(quote), dict):
                free = balance[quote].get("free")
            if free is None:
                free = (balance.get("free") or {}).get(quote)
            if free is not None:
                free = float(free)
                self._balance_cache[cache_key] = (now, free)
                return free
            logger.warning("No %s balance found for key '%s'", quote, api_key_record.name)
            blb.push(bot_name, "WARN", f"Could not read {quote} balance from exchange")
        except Exception as exc:
            logger.warning("fetch_balance failed for key '%s': %s", api_key_record.name, exc)
            blb.push(bot_name, "WARN", f"Balance fetch failed: {exc}")
        return None

    def _close_all_open_positions(self, bot, db, key_records):
        """Market-close every open non-backtest position for a bot before it is
        force-stopped. A stopped bot no longer evaluates SL/TP, so leaving live
        positions open would mean unmanaged, unbounded exposure."""
        open_positions = db.query(Position).options(selectinload(Position.orders)).filter(
            Position.bot_name == bot.name,
            Position.status == "open",
            Position.mode.in_(["forward_test", "paper", "live"]),
        ).all()
        if not open_positions:
            return

        api_key_record = None
        if bot.settings.get("api_execution") and bot.settings.get("api_key_name"):
            api_key_record = key_records.get(bot.settings.get("api_key_name"))

        ccxt_inst = None
        if api_key_record and any(p.mode in ("paper", "live") for p in open_positions):
            try:
                ccxt_inst = self._get_ccxt_instance(api_key_record)
                ccxt_inst.load_markets()
            except Exception as exc:
                logger.error("Could not build exchange client to close positions for '%s': %s", bot.name, exc, exc_info=True)

        now_ts = _naive_utc(datetime.now(timezone.utc))
        timeframe = bot.settings.get("timeframe")

        for pos in open_positions:
            last_candle = db.query(Candle.close).filter(
                Candle.exchange == pos.exchange, Candle.symbol == pos.symbol, Candle.timeframe == timeframe
            ).order_by(Candle.timestamp.desc()).first()
            close_price = float(last_candle[0]) if last_candle else pos.entry_price

            close_qty = pos.amount
            actual_price = close_price
            actual_fee = 0.0
            order_id = f"local_{int(time.time())}_{uuid.uuid4().hex[:8]}"
            ccxt_symbol = pos.symbol.replace('-', '/').upper()

            if pos.mode in ("paper", "live"):
                if ccxt_inst is None:
                    logger.error("Cannot close %s position on %s for '%s': no exchange client. Position left open.", pos.mode, pos.symbol, bot.name)
                    blb.push(bot.name, "ERROR", f"Could not close {pos.mode} position on {pos.symbol}: exchange unavailable — close it manually!")
                    continue
                try:
                    sell_qty = float(ccxt_inst.amount_to_precision(ccxt_symbol, close_qty))
                    if sell_qty <= 0:
                        continue
                    ex_order = ccxt_inst.create_market_sell_order(ccxt_symbol, sell_qty)
                    ex_order = self._reconcile_order(ccxt_inst, ex_order, ccxt_symbol)
                    filled_qty = float(ex_order.get("filled") or 0)
                    if filled_qty <= 0 and ex_order.get("status") != "closed":
                        db.add(Order(position_id=pos.id, exchange=pos.exchange, bot_name=bot.name, mode=pos.mode, symbol=pos.symbol, side="sell", order_type="market", price=close_price, amount=sell_qty, timestamp=now_ts, exchange_order_id=ex_order.get("id"), status="canceled"))
                        db.commit()
                        blb.push(bot.name, "ERROR", f"Forced close on {pos.symbol} did not fill; position left open — close it manually!")
                        continue
                    close_qty = filled_qty if filled_qty > 0 else sell_qty
                    actual_price = ex_order.get("average") or ex_order.get("price") or close_price
                    order_id = ex_order.get("id") or order_id
                    actual_fee = self._fee_in_quote(ex_order.get("fee"), ccxt_symbol, actual_price)
                except Exception as exc:
                    logger.error("Forced close failed for '%s' on %s: %s", bot.name, pos.symbol, exc, exc_info=True)
                    blb.push(bot.name, "ERROR", f"Forced close failed on {pos.symbol}: {exc} — close it manually!")
                    continue

            realized_pnl = (actual_price - pos.entry_price) * close_qty - actual_fee
            pos.profit_abs = (pos.profit_abs or 0.0) + realized_pnl
            if pos.entry_price and pos.amount:
                pos.profit_pct = (pos.profit_pct or 0.0) + ((actual_price - pos.entry_price) / pos.entry_price) * 100 * (close_qty / pos.amount)

            db.add(Order(position_id=pos.id, exchange=pos.exchange, bot_name=bot.name, mode=pos.mode, symbol=pos.symbol, side="sell", order_type="market", price=actual_price, amount=close_qty, timestamp=now_ts, exchange_order_id=order_id, status="filled", fee=actual_fee))

            if close_qty >= pos.amount - 0.00001:
                pos.status = "closed"
                pos.closed_at = now_ts
                with self._position_states_lock:
                    self.position_states.pop(pos.id, None)
            else:
                pos.amount -= close_qty
                blb.push(bot.name, "WARN", f"Partial forced close on {pos.symbol}: {close_qty} sold, {pos.amount} still open — close it manually!")

            if pos.mode in ("paper", "live"):
                db.commit()

            logger.info("Forced close [%s] %s: %s @ %s (PnL %+.2f)", pos.mode, pos.symbol, close_qty, actual_price, realized_pnl)
            blb.push(bot.name, "INFO", f"Forced close [{pos.mode}] {pos.symbol}: {close_qty} @ {actual_price} (PnL {realized_pnl:+.2f})")

    def _calculate_trade_amount(self, current_price, bot_settings, current_equity=None):
        if not current_price or current_price <= 0:
            logger.warning("Invalid current_price (%s), cannot calculate trade amount", current_price)
            return None

        entry_settings = bot_settings.get("trade_settings", {}).get("entry", {})
        amount_type = entry_settings.get("amount_type", "percentage")
        raw_val = entry_settings.get("amount_value")

        try:
            amount_value = float(raw_val) if raw_val and float(raw_val) > 0 else 100.0
        except (ValueError, TypeError):
            amount_value = 100.0

        if amount_type == "fixed":
            trade_amount = amount_value / current_price
            return max(trade_amount, 0.0001)
        else:
            capital = current_equity if current_equity is not None else float(bot_settings.get("backtest_capital", 1000))
            if capital <= 0:
                return None
            investment = capital * (amount_value / 100)
            trade_amount = investment / current_price
            return max(trade_amount, 0.0001)

    def _check_exits(self, open_position, row_close, row_high, row_low, is_sell_signal, bot_settings, current_atr=0.0, row_open=None):
        trade_settings = bot_settings.get("trade_settings", {})
        entry_settings = trade_settings.get("entry", {})
        events = []
        if row_open is None:
            row_open = row_close

        with self._position_states_lock:
            state = self.position_states.get(open_position.id)
            if not state or state.get('entry_price') != open_position.entry_price:
                # Restore persisted state from DB, or initialize fresh
                persisted_highest = open_position.highest_price or open_position.entry_price
                persisted_exits = set(open_position.triggered_exits or [])
                state = {
                    'entry_price': open_position.entry_price,
                    'highest_price': persisted_highest,
                    'triggered_exits': persisted_exits
                }
                self.position_states[open_position.id] = state
            # Trailing levels anchor to the peak reached BEFORE this candle; the
            # current candle's high is folded in afterwards so one candle cannot
            # both raise the trail and trigger it against its own low.
            prev_highest = state['highest_price']
            triggered_exits = set(state['triggered_exits'])

        sl_hit = False
        for i, sl in enumerate(entry_settings.get("stop_losses", [])):
            sl_id = f"sl_{i}"
            if sl_id in triggered_exits: continue

            try:
                sl_val = float(sl.get('value', 0))
            except (ValueError, TypeError):
                continue

            if sl_val <= 0: continue

            sl_type = sl.get('type', '')
            if sl_type not in VALID_EXIT_TYPES:
                logger.warning("Invalid stop_loss type '%s' for sl_%d, skipping", sl_type, i)
                continue

            if sl_type == 'percentage':
                trigger_price = open_position.entry_price * (1 - (sl_val/100))
            elif sl_type == 'trailing':
                trigger_price = prev_highest * (1 - (sl_val/100))
            elif sl_type == 'atr':
                if not (current_atr > 0): continue
                trigger_price = prev_highest - (sl_val * current_atr)
            else:
                trigger_price = sl_val

            if row_low <= trigger_price:
                sl_close_type = sl.get('close_amount_type', 'percentage')
                sl_close_val = float(sl.get('close_amount_value', 100))
                events.append({
                    'qty_pct': sl_close_val,
                    'close_amount_type': sl_close_type,
                    'reason': "stop_loss",
                    # A gap below the trigger fills at the open, not the trigger
                    'price': min(trigger_price, row_open),
                    'id': sl_id
                })
                sl_hit = True

        if not sl_hit:
            tps = []
            for i, tp in enumerate(entry_settings.get("take_profits", [])):
                tp_id = f"tp_{i}"
                if tp_id in triggered_exits: continue

                try:
                    tp_val = float(tp.get('value', 0))
                except (ValueError, TypeError):
                    continue

                if tp_val <= 0: continue

                tp_type = tp.get('type', '')
                if tp_type not in VALID_EXIT_TYPES:
                    logger.warning("Invalid take_profit type '%s' for tp_%d, skipping", tp_type, i)
                    continue

                tp_close_type = tp.get('close_amount_type', 'percentage')
                tp_close_val = float(tp.get('close_amount_value', 100))

                if tp_type == 'percentage':
                    t_price = open_position.entry_price * (1 + (tp_val/100))
                    if row_high >= t_price:
                        # A gap above the target fills at the (better) open price
                        tps.append({'id': tp_id, 'price': max(t_price, row_open), 'pct': tp_close_val, 'close_amount_type': tp_close_type})
                elif tp_type == 'trailing':
                    # Trailing TP: price must first rise above entry by tp_val%, then
                    # we close when price drops tp_val% from the highest price reached.
                    activation_price = open_position.entry_price * (1 + (tp_val / 100))
                    if prev_highest >= activation_price:
                        # Once activated, trail below the peak
                        t_price = prev_highest * (1 - (tp_val / 100))
                        if row_low <= t_price:
                            tps.append({'id': tp_id, 'price': min(t_price, row_open), 'pct': tp_close_val, 'close_amount_type': tp_close_type})
                elif tp_type == 'atr':
                    if not (current_atr > 0): continue
                    t_price = prev_highest - (tp_val * current_atr)
                    if row_low <= t_price:
                        tps.append({'id': tp_id, 'price': min(t_price, row_open), 'pct': tp_close_val, 'close_amount_type': tp_close_type})
                else:
                    t_price = tp_val
                    if row_high >= t_price:
                        tps.append({'id': tp_id, 'price': max(t_price, row_open), 'pct': tp_close_val, 'close_amount_type': tp_close_type})

            tps = sorted(tps, key=lambda x: x['price'], reverse=True)

            for tp in tps:
                events.append({
                    'qty_pct': tp['pct'],
                    'close_amount_type': tp.get('close_amount_type', 'percentage'),
                    'reason': "take_profit",
                    'price': tp['price'],
                    'id': tp['id']
                })

        if not events and is_sell_signal:
            exit_settings = trade_settings.get("exit", {})
            pct_to_close = float(exit_settings.get('amount_value', 100)) if exit_settings.get('amount_type') == 'percentage' else 100
            events.append({
                'qty_pct': pct_to_close,
                'reason': "strategy",
                'price': row_close,
                'id': 'strategy_sell'
            })

        with self._position_states_lock:
            state['highest_price'] = max(state['highest_price'], row_high)
            # Persist state back to DB for crash recovery
            open_position.highest_price = state['highest_price']

        return events

    async def _startup_backfill(self):
        def get_active_bot_ids():
            db = SessionLocal()
            try:
                active_bots = db.query(BotConfig).filter(BotConfig.is_active == True).all()
                return [bot.id for bot in active_bots]
            finally:
                db.close()

        bot_ids = await asyncio.to_thread(get_active_bot_ids)
        for bot_id in bot_ids:
            self._spawn(self._run_backfill_safely(bot_id))

    async def _listen_for_bot_starts(self):
        queue = event_bus.subscribe("BOT_STATE_CHANGED")
        while self.running:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                if event["action"] == "started":
                    self._spawn(self._run_backfill_safely(event["bot_id"]))
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    async def _run_backfill_safely(self, bot_id: int):
        try:
            await asyncio.to_thread(self._execute_sync_backfill, bot_id)
        except Exception as e:
            logger.error("Error during thread backfill for bot_id=%s: %s", bot_id, e, exc_info=True)

    def _execute_sync_backfill(self, bot_id: int):
        db = SessionLocal()
        _log_name = f"bot_id={bot_id}"
        try:
            bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first()
            if not bot or not bot.is_active: return
            _log_name = bot.name
            self._backfilling_bots.add(bot.name)

            is_api_exec = bot.settings.get("api_execution", False)
            has_key = bool(bot.settings.get("api_key_name"))

            live_mode = "forward_test"
            exchange_name = bot.settings.get("data_exchange", "okx")
            if is_api_exec and has_key:
                api_key = db.query(ExchangeKey).filter(ExchangeKey.name == bot.settings.get("api_key_name")).first()
                if api_key:
                    live_mode = "paper" if api_key.is_sandbox else "live"
                    exchange_name = api_key.exchange or exchange_name
                else:
                    logger.warning("Bot '%s': api_key_name='%s' not found in database. Falling back to forward_test mode.", bot.name, bot.settings.get("api_key_name"))
                    blb.push(bot.name, "WARN", f"API key '{bot.settings.get('api_key_name')}' not found, running as forward_test")

            timeframe = bot.settings.get("timeframe")
            exit_node = bot.settings.get("exit_node")
            run_backtest = bot.settings.get("backtest_on_start", False)
            lookback_limit = int(bot.settings.get("backtest_lookback", 150))

            symbols = bot.settings.get("symbols", [])
            if not symbols and bot.settings.get("symbol"):
                symbols = [bot.settings.get("symbol")]

            # Shared capital pool across ALL symbols for this bot
            bt_starting_capital = float(bot.settings.get("backtest_capital", 1000))
            bt_equity = bt_starting_capital  # Available cash (not locked in positions)
            bt_peak_equity = bt_starting_capital
            bt_max_dd = 0.0  # peak-to-trough on the mark-to-market equity curve

            # Fee and slippage for realistic backtest P&L
            bt_trade_settings = bot.settings.get("trade_settings", {})
            bt_entry_fee = float(bt_trade_settings.get("entry", {}).get("fee", 0)) / 100
            raw_exit_fee = bt_trade_settings.get("exit", {}).get("fee")
            bt_exit_fee = float(raw_exit_fee) / 100 if raw_exit_fee is not None else bt_entry_fee
            bt_entry_slippage = float(bt_trade_settings.get("entry", {}).get("slippage", 0)) / 100
            bt_exit_slippage = float(bt_trade_settings.get("exit", {}).get("slippage", 0)) / 100

            cooldown_trades = int(bot.settings.get("cooldown_trades", 0))
            cooldown_candles = int(bot.settings.get("cooldown_candles", 0))

            # Per-symbol data prep first (indicators stay per symbol); execution
            # then runs over one merged timeline so all symbols contend for the
            # shared capital pool in chronological order.
            sym_contexts = []

            for symbol in symbols:
                blb.push(bot.name, "INFO", f"Starting: {symbol} | {timeframe} | {live_mode} | lookback={lookback_limit}")
                tf_seconds = 60
                if timeframe.endswith('m'): tf_seconds = int(timeframe[:-1]) * 60
                elif timeframe.endswith('h'): tf_seconds = int(timeframe[:-1]) * 3600
                elif timeframe.endswith('d'): tf_seconds = int(timeframe[:-1]) * 86400

                # Use fresh sessions for all polling queries. The main `db` session starts an
                # implicit SQLite transaction on its first read (line above), so any subsequent
                # reads on it see a stale snapshot and will never reflect candles written by
                # the streamer in a separate session. Fresh sessions start new transactions
                # that see all committed data.
                def _count_candles():
                    _db = SessionLocal()
                    try:
                        return _db.query(Candle.id).filter(Candle.exchange == exchange_name, Candle.symbol == symbol, Candle.timeframe == timeframe).count()
                    finally:
                        _db.close()

                def _latest_candle_ts():
                    _db = SessionLocal()
                    try:
                        return _db.query(Candle.timestamp).filter(
                            Candle.exchange == exchange_name, Candle.symbol == symbol, Candle.timeframe == timeframe
                        ).order_by(Candle.timestamp.desc()).first()
                    finally:
                        _db.close()

                initial_count = _count_candles()
                if initial_count < lookback_limit:
                    logger.info("Waiting for candle data: %s (%d/%d candles)...", symbol, initial_count, lookback_limit)
                    blb.push(bot.name, "INFO", f"Fetching historical data: {symbol} ({initial_count}/{lookback_limit} candles)...")

                    max_wait = 300  # 5 minutes max
                    waited = 0
                    stable_checks = 0
                    last_count = initial_count
                    last_log_count = initial_count

                    while waited < max_wait:
                        time.sleep(2)
                        waited += 2
                        current_count = _count_candles()

                        # Log progress when count changes significantly
                        if current_count - last_log_count >= 100:
                            blb.push(bot.name, "INFO", f"Fetching historical data: {symbol} ({current_count}/{lookback_limit} candles)...")
                            last_log_count = current_count

                        if current_count >= lookback_limit:
                            break

                        if current_count == last_count:
                            stable_checks += 1
                            if stable_checks >= 5:  # 10 seconds of no change — backfill done
                                break
                        else:
                            stable_checks = 0

                        last_count = current_count

                final_count = _count_candles()
                logger.info("Data available for %s: %d candles.", symbol, final_count)
                if final_count == 0:
                    blb.push(bot.name, "WARN", f"No candle data for {symbol} on {exchange_name} ({timeframe}). This exchange may not support the '{timeframe}' timeframe.")
                elif final_count < lookback_limit:
                    blb.push(bot.name, "INFO", f"Historical data ready: {symbol} ({final_count}/{lookback_limit} requested)")
                else:
                    blb.push(bot.name, "INFO", f"Historical data ready: {symbol} ({final_count} candles)")

                # Only wait for fresh candles if this bot does live/paper execution
                if live_mode in ("paper", "live"):
                    for _ in range(20):
                        latest_candle = _latest_candle_ts()
                        if latest_candle:
                            candle_ts = latest_candle[0]
                            if candle_ts.tzinfo is None: candle_ts = candle_ts.replace(tzinfo=timezone.utc)
                            diff_seconds = datetime.now(timezone.utc).timestamp() - candle_ts.timestamp()
                            if diff_seconds <= (tf_seconds * 2): break
                        time.sleep(1)

                # Fresh session for the candle read as well — same stale-snapshot reason.
                candle_db = SessionLocal()
                try:
                    query = candle_db.query(Candle.id, Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume).filter(
                        Candle.exchange == exchange_name, Candle.symbol == symbol, Candle.timeframe == timeframe
                    ).order_by(Candle.timestamp.desc()).limit(lookback_limit).statement
                    df = pd.read_sql(query, candle_db.bind)
                finally:
                    candle_db.close()

                if df.empty or len(df) < 20:
                    logger.info("Skipping backfill for %s: insufficient data (%d candles, minimum 20 required).", symbol, len(df))
                    blb.push(bot.name, "WARN", f"Skipping backtest: {symbol} — only {len(df)} candles available (minimum 20)")
                    continue

                df = df.sort_values('timestamp').reset_index(drop=True)

                evaluator = NodeEvaluator(bot.settings)
                evaluator.df = df.copy()
                evaluator._calculate_indicators()

                existing_timestamps = {_naive_utc(s[0]) for s in db.query(Signal.timestamp).filter(Signal.bot_name == bot.name, Signal.symbol == symbol).all()}

                open_bt_pos = None
                last_bt_ts = None

                if run_backtest:
                    blb.push(bot.name, "INFO", f"Running backtest on {len(df)} candles...")
                    last_order = db.query(Order).filter(Order.bot_name == bot.name, Order.symbol == symbol, Order.mode == "backtest").order_by(Order.timestamp.desc()).first()
                    if last_order:
                        last_bt_ts = last_order.timestamp
                        if last_bt_ts.tzinfo is None: last_bt_ts = last_bt_ts.replace(tzinfo=timezone.utc)

                    open_bt_pos = db.query(Position).filter(Position.bot_name == bot.name, Position.symbol == symbol, Position.mode == "backtest", Position.status == "open").first()

                entry_series = evaluator.resolve_node(bot.settings.get("entry_node")) if bot.settings.get("entry_node") else pd.Series(False, index=evaluator.df.index)
                exit_series = evaluator.resolve_node(exit_node) if exit_node else pd.Series(False, index=evaluator.df.index)

                # Pre-extract numpy arrays once — avoids O(n) .iloc index lookups inside the loop
                _standard_cols = {'id', 'timestamp', 'open', 'high', 'low', 'close', 'volume', 'atr'}
                sym_contexts.append({
                    "symbol": symbol,
                    "df": evaluator.df,
                    "entry_arr": entry_series.values,
                    "exit_arr": exit_series.values,
                    "atr_arr": evaluator.df['atr'].values if 'atr' in evaluator.df.columns else None,
                    "indicator_cols": [c for c in evaluator.df.columns if c not in _standard_cols],
                    "existing_timestamps": existing_timestamps,
                    "last_bt_ts": last_bt_ts,
                    "open_pos": open_bt_pos,
                    "original_amount": None,  # for weighted profit_pct calculation
                    "trade_entry_indices": [],
                    "new_signals": [],
                    "last_close": None,
                })

            # ── Merged chronological execution across all symbols ──
            timeline = []
            for ci, ctx in enumerate(sym_contexts):
                for idx, ts_val in enumerate(list(ctx["df"]['timestamp'])):
                    # Normalize sort keys — legacy rows can be tz-aware while new
                    # rows are naive, and mixed values are not comparable
                    timeline.append((_naive_utc(ts_val), ci, idx))
            timeline.sort(key=lambda t: (t[0], t[1]))

            max_pos = int(bot.settings.get("max_positions", 1))

            for _ts_key, ci, index in timeline:
                ctx = sym_contexts[ci]
                symbol = ctx["symbol"]
                row = ctx["df"].iloc[index]
                ts = row['timestamp']
                if ts.tzinfo is None: ts = ts.replace(tzinfo=timezone.utc)

                current_price = float(row['close'])
                current_open = float(row['open'])
                current_high = float(row['high'])
                current_low = float(row['low'])
                ctx["last_close"] = current_price
                just_opened_this_tick = False

                is_buy = bool(ctx["entry_arr"][index])
                is_sell = bool(ctx["exit_arr"][index])
                atr_arr = ctx["atr_arr"]
                current_atr = float(atr_arr[index]) if atr_arr is not None and not pd.isna(atr_arr[index]) else 0.0

                if run_backtest and (ctx["last_bt_ts"] is None or ts > ctx["last_bt_ts"]):
                    open_bt_pos = ctx["open_pos"]

                    # Cooldown check: block entry if too many trades occurred within the cooldown window
                    can_buy_cooldown = True
                    if cooldown_trades > 0 and cooldown_candles > 0:
                        recent_trades = [idx for idx in ctx["trade_entry_indices"] if (index - idx) < cooldown_candles]
                        if len(recent_trades) >= cooldown_trades:
                            can_buy_cooldown = False

                    # Capital depletion halt: no new entries, exits keep running
                    if is_buy and not open_bt_pos and 1 <= max_pos and can_buy_cooldown and bt_equity > 0:
                        trade_amount = self._calculate_trade_amount(current_price, bot.settings, current_equity=bt_equity)
                        if trade_amount is not None:
                            bt_entry_price = current_price * (1 + bt_entry_slippage)
                            # Percentage sizing spends a share of equity; cap the
                            # amount so slippage + entry fee fit within the pool
                            # (100% sizing would otherwise always exceed it)
                            _entry_cfg = bot.settings.get("trade_settings", {}).get("entry", {})
                            if _entry_cfg.get("amount_type", "percentage") != "fixed":
                                max_affordable = bt_equity / (bt_entry_price * (1 + bt_entry_fee))
                                trade_amount = min(trade_amount, max_affordable)
                            investment_cost = bt_entry_price * trade_amount
                            total_cost = investment_cost * (1 + bt_entry_fee)
                            if trade_amount > 0 and total_cost <= bt_equity + 1e-9:
                                ctx["trade_entry_indices"].append(index)
                                ctx["original_amount"] = trade_amount
                                bt_equity = max(bt_equity - total_cost, 0.0)  # Lock capital + entry fee
                                open_bt_pos = Position(exchange=exchange_name, bot_name=bot.name, symbol=symbol, mode="backtest", status="open", side="long", entry_price=bt_entry_price, amount=trade_amount, created_at=_naive_utc(ts))
                                db.add(open_bt_pos)
                                db.flush()
                                db.add(Order(position_id=open_bt_pos.id, exchange=exchange_name, bot_name=bot.name, mode="backtest", symbol=symbol, side="buy", order_type="market", price=bt_entry_price, amount=trade_amount, timestamp=_naive_utc(ts), status="filled", fee=investment_cost * bt_entry_fee))
                                ctx["open_pos"] = open_bt_pos
                                just_opened_this_tick = True

                    elif open_bt_pos and not just_opened_this_tick:
                        exit_events = self._check_exits(open_bt_pos, current_price, current_high, current_low, is_sell, bot.settings, current_atr, row_open=current_open)

                        for ev in exit_events:
                            open_bt_pos = ctx["open_pos"]
                            if open_bt_pos is None: break

                            if ev.get('close_amount_type') == 'fixed':
                                close_qty = min(ev['qty_pct'], open_bt_pos.amount)
                            else:
                                close_qty = open_bt_pos.amount * (ev['qty_pct'] / 100)
                            close_qty = min(close_qty, open_bt_pos.amount)
                            if close_qty <= 0: continue

                            actual_price = ev['price'] * (1 - bt_exit_slippage)
                            db.add(Order(position_id=open_bt_pos.id, exchange=exchange_name, bot_name=bot.name, mode="backtest", symbol=symbol, side="sell", order_type="market", price=actual_price, amount=close_qty, timestamp=_naive_utc(ts), status="filled", fee=actual_price * close_qty * bt_exit_fee))

                            entry_cost = open_bt_pos.entry_price * close_qty * (1 + bt_entry_fee)
                            exit_proceeds = actual_price * close_qty * (1 - bt_exit_fee)
                            realized_pnl = exit_proceeds - entry_cost
                            open_bt_pos.profit_abs = (open_bt_pos.profit_abs or 0.0) + realized_pnl

                            # Return sale proceeds to capital pool
                            bt_equity += exit_proceeds

                            # Weighted profit_pct: accumulate based on portion of original position closed (fee-adjusted)
                            original_amount = ctx["original_amount"]
                            if original_amount and original_amount > 0:
                                portion_pct = (realized_pnl / entry_cost) * 100 if entry_cost > 0 else 0.0
                                weight = close_qty / original_amount
                                open_bt_pos.profit_pct = (open_bt_pos.profit_pct or 0.0) + (portion_pct * weight)

                            with self._position_states_lock:
                                if open_bt_pos.id in self.position_states:
                                    self.position_states[open_bt_pos.id]['triggered_exits'].add(ev['id'])
                                    open_bt_pos.triggered_exits = list(self.position_states[open_bt_pos.id]['triggered_exits'])

                            if close_qty >= open_bt_pos.amount - 0.00001:
                                open_bt_pos.status = "closed"
                                open_bt_pos.closed_at = _naive_utc(ts)
                                with self._position_states_lock:
                                    self.position_states.pop(open_bt_pos.id, None)
                                ctx["open_pos"] = None
                                ctx["original_amount"] = None
                            else:
                                open_bt_pos.amount -= close_qty

                if _naive_utc(ts) not in ctx["existing_timestamps"]:
                    indicators = { col: float(row[col]) for col in ctx["indicator_cols"] if not pd.isna(row[col]) }
                    if indicators:
                        action_str = "buy" if is_buy else ("sell" if is_sell else "neutral")
                        ctx["new_signals"].append(Signal(candle_id=int(row['id']), symbol=symbol, timestamp=ts, bot_name=bot.name, name="STRATEGY_TICK", action=action_str, extra_data=indicators))

                # Mark-to-market equity curve: cash + open positions at their last close
                if run_backtest:
                    open_value = 0.0
                    for c2 in sym_contexts:
                        p2 = c2["open_pos"]
                        if p2 is not None and c2["last_close"]:
                            open_value += p2.amount * c2["last_close"]
                    equity_now = bt_equity + open_value
                    bt_peak_equity = max(bt_peak_equity, equity_now)
                    if bt_peak_equity > 0:
                        bt_max_dd = max(bt_max_dd, ((bt_peak_equity - equity_now) / bt_peak_equity) * 100)

            # Close any trailing open backtest positions at the last available price.
            # Forward test / live must always start flat — a simulated entry must
            # never become a tracked live position.
            if run_backtest:
                for ctx in sym_contexts:
                    open_bt_pos = ctx["open_pos"]
                    if not open_bt_pos:
                        continue
                    df_s = ctx["df"]
                    last_price = float(df_s.iloc[-1]['close'])
                    remaining_qty = open_bt_pos.amount
                    last_ts = df_s.iloc[-1]['timestamp']
                    if last_ts.tzinfo is None: last_ts = last_ts.replace(tzinfo=timezone.utc)

                    entry_cost = open_bt_pos.entry_price * remaining_qty * (1 + bt_entry_fee)
                    exit_proceeds = last_price * remaining_qty * (1 - bt_exit_fee)
                    final_pnl = exit_proceeds - entry_cost

                    open_bt_pos.profit_abs = (open_bt_pos.profit_abs or 0.0) + final_pnl
                    original_amount = ctx["original_amount"]
                    if original_amount and original_amount > 0:
                        portion_pct = (final_pnl / entry_cost) * 100 if entry_cost > 0 else 0.0
                        weight = remaining_qty / original_amount
                        open_bt_pos.profit_pct = (open_bt_pos.profit_pct or 0.0) + (portion_pct * weight)

                    open_bt_pos.status = "closed"
                    open_bt_pos.closed_at = _naive_utc(last_ts)
                    bt_equity += exit_proceeds  # Return proceeds to capital pool
                    db.add(Order(position_id=open_bt_pos.id, exchange=exchange_name, bot_name=bot.name, mode="backtest", symbol=ctx["symbol"], side="sell", order_type="market", price=last_price, amount=remaining_qty, timestamp=_naive_utc(last_ts), status="filled", fee=last_price * remaining_qty * bt_exit_fee))

                    with self._position_states_lock:
                        self.position_states.pop(open_bt_pos.id, None)
                    ctx["open_pos"] = None

            # Commit signals in batches — INSERT OR IGNORE respects the unique constraint
            for ctx in sym_contexts:
                new_signals = ctx["new_signals"]
                for i in range(0, len(new_signals), 500):
                    batch = new_signals[i:i+500]
                    for sig in batch:
                        db.execute(
                            text("INSERT OR IGNORE INTO signals (candle_id, symbol, timestamp, bot_name, name, action, extra_data) VALUES (:cid, :sym, :ts, :bn, :nm, :act, :ed)"),
                            {"cid": sig.candle_id, "sym": sig.symbol, "ts": str(_naive_utc(sig.timestamp)), "bn": sig.bot_name, "nm": sig.name, "act": sig.action, "ed": json.dumps(sig.extra_data)}
                        )
                    db.commit()
            # Always commit — positions/orders from the backtest loop need to be persisted
            # even when there are no new signals
            db.commit()

            for ctx in sym_contexts:
                trade_count = len(ctx["trade_entry_indices"]) if run_backtest else 0
                logger.info("Backfill complete: '%s' on %s | mode=%s | %d candles | %d trades | equity=$%.2f", bot.name, ctx["symbol"], live_mode.upper(), len(ctx["df"]), trade_count, bt_equity)
                if run_backtest:
                    blb.push(bot.name, "INFO", f"Backtest complete: {ctx['symbol']} | {len(ctx['df'])} candles | {trade_count} trades | equity=${bt_equity:.2f}")
                else:
                    blb.push(bot.name, "INFO", f"Ready: {ctx['symbol']} | {len(ctx['df'])} candles | mode={live_mode.upper()}")

            # After the full chronological run, enforce max drawdown on the
            # mark-to-market equity curve before the bot is allowed to go live
            if run_backtest:
                max_drawdown_pct = float(bot.settings.get("max_drawdown", 0))
                if max_drawdown_pct > 0:
                    self._drawdown_cache.pop((bot.name, "backtest"), None)
                    if bt_max_dd >= max_drawdown_pct:
                        logger.warning("Bot '%s' backtest drawdown (%.2f%%) exceeds max (%.2f%%), stopping before live", bot.name, bt_max_dd, max_drawdown_pct)
                        blb.push(bot.name, "WARN", f"Backtest max drawdown {bt_max_dd:.2f}% >= {max_drawdown_pct:.2f}%, bot stopped — not allowed to go live")
                        bot.is_active = False
                        db.commit()
                        return

            # Make the backtest→live handover visible in the console: the next
            # tick only arrives when the current candle closes on the exchange
            try:
                tf_secs = _tf_seconds(timeframe)
                next_close = datetime.fromtimestamp(((int(time.time()) // tf_secs) + 1) * tf_secs, tz=timezone.utc)
                blb.push(bot.name, "INFO", f"Live monitoring active ({live_mode}) — next {timeframe} candle closes ~{next_close.strftime('%H:%M')} UTC")
            except Exception:
                blb.push(bot.name, "INFO", f"Live monitoring active ({live_mode}) — waiting for the next {timeframe} candle close")

        except Exception as e:
            logger.error("Backfill Error: %s", e, exc_info=True)
            blb.push(_log_name, "ERROR", f"Backfill error: {e}")
            db.rollback()
        finally:
            self._backfilling_bots.discard(_log_name)
            db.close()

    async def _process_bots(self, exchange: str, symbol: str, timeframe: str):
        def run_logic():
            db = SessionLocal()
            try:
                active_bots = db.query(BotConfig).filter(BotConfig.is_active == True).all()

                # Batch-load all exchange keys once (avoids per-bot DB queries)
                all_key_names = {b.settings.get("api_key_name") for b in active_bots if b.settings.get("api_key_name")}
                key_records = {}
                if all_key_names:
                    for kr in db.query(ExchangeKey).filter(ExchangeKey.name.in_(all_key_names)).all():
                        key_records[kr.name] = kr

                matching_bots = []
                for b in active_bots:
                    syms = b.settings.get("symbols", [])
                    if not syms and b.settings.get("symbol"):
                        syms = [b.settings.get("symbol")]
                    # Match on exchange: derive bot's exchange from its key or data_exchange setting
                    api_key_name = b.settings.get("api_key_name")
                    bot_exchange = b.settings.get("data_exchange", "okx")
                    if api_key_name:
                        key_rec = key_records.get(api_key_name)
                        if key_rec:
                            bot_exchange = key_rec.exchange or bot_exchange
                    if symbol in syms and b.settings.get("timeframe") == timeframe and bot_exchange == exchange:
                        matching_bots.append(b)

                if not matching_bots: return

                max_lookback = max([int(b.settings.get("backtest_lookback", 150)) for b in matching_bots], default=150)

                query = db.query(Candle.id, Candle.timestamp, Candle.open, Candle.high, Candle.low, Candle.close, Candle.volume).filter(
                    Candle.exchange == exchange, Candle.symbol == symbol, Candle.timeframe == timeframe
                ).order_by(Candle.timestamp.desc()).limit(max_lookback).statement

                df = pd.read_sql(query, db.bind)

                if df.empty or len(df) < 20:
                    return

                df = df.iloc[::-1].reset_index(drop=True)

                indicator_cache = {}  # fingerprint -> DataFrame with indicators computed

                # ── Batch pre-load: positions, orders counts (1 query each instead of N) ──
                matching_bot_names = [b.name for b in matching_bots if b.name not in self._deleted_bots and b.name not in self._backfilling_bots]

                # Pre-load ALL open positions for all matching bots in one query.
                # Not filtered on symbol: global max_positions scope must count
                # open positions across every whitelist pair.
                _all_open_positions = db.query(Position).options(
                    selectinload(Position.orders)
                ).filter(
                    Position.bot_name.in_(matching_bot_names),
                    Position.status == "open"
                ).all() if matching_bot_names else []

                _positions_by_bot_mode = defaultdict(list)
                for p in _all_open_positions:
                    _positions_by_bot_mode[(p.bot_name, p.mode)].append(p)

                # Pre-load cooldown buy counts for all bots in one query
                tf_seconds = 60
                if timeframe.endswith('m'): tf_seconds = int(timeframe[:-1]) * 60
                elif timeframe.endswith('h'): tf_seconds = int(timeframe[:-1]) * 3600
                elif timeframe.endswith('d'): tf_seconds = int(timeframe[:-1]) * 86400

                _cooldown_counts = {}
                cooldown_bots = [b for b in matching_bots if int(b.settings.get("cooldown_trades", 0)) > 0 and int(b.settings.get("cooldown_candles", 0)) > 0]
                if cooldown_bots:
                    # Only executed buys in the bot's own mode count toward cooldown —
                    # backtest history must not block live entries
                    _bot_modes = {}
                    for b in cooldown_bots:
                        m = "forward_test"
                        if b.settings.get("api_execution") and b.settings.get("api_key_name"):
                            kr = key_records.get(b.settings.get("api_key_name"))
                            if kr:
                                m = "paper" if kr.is_sandbox else "live"
                        _bot_modes[b.name] = m
                    now_utc = datetime.now(timezone.utc)
                    _bot_windows = {
                        b.name: now_utc - timedelta(seconds=int(b.settings.get("cooldown_candles", 0)) * tf_seconds)
                        for b in cooldown_bots
                    }
                    max_cooldown_candles = max(int(b.settings.get("cooldown_candles", 0)) for b in cooldown_bots)
                    min_threshold = _naive_utc(now_utc - timedelta(seconds=max_cooldown_candles * tf_seconds))
                    _recent_buys = db.query(Order.bot_name, Order.mode, Order.timestamp).filter(
                        Order.bot_name.in_([b.name for b in cooldown_bots]),
                        Order.symbol == symbol,
                        Order.side == "buy",
                        Order.status == "filled",
                        Order.timestamp > min_threshold
                    ).all()
                    for _bn, _om, _ots in _recent_buys:
                        if _om != _bot_modes.get(_bn):
                            continue
                        if _ots.tzinfo is None:
                            _ots = _ots.replace(tzinfo=timezone.utc)
                        if _ots > _bot_windows[_bn]:
                            _cooldown_counts[_bn] = _cooldown_counts.get(_bn, 0) + 1

                # Collect all signal inserts for a single batch commit
                _pending_signals = []

                for bot in matching_bots:
                    if bot.name in self._deleted_bots or bot.name in self._backfilling_bots:
                        continue

                    # Max drawdown guard: auto-stop bot if live drawdown exceeds threshold
                    max_drawdown_pct = float(bot.settings.get("max_drawdown", 0))
                    if max_drawdown_pct > 0:
                        live_capital = float(bot.settings.get("backtest_capital", 1000))
                        dd_state = self._get_drawdown(bot.name, db, mode_group="live", starting_capital=live_capital)
                        if dd_state["max_dd"] >= max_drawdown_pct:
                            logger.warning("Bot '%s' hit max drawdown (%.2f%% >= %.2f%%), auto-stopping", bot.name, dd_state["max_dd"], max_drawdown_pct)
                            blb.push(bot.name, "WARN", f"Max drawdown hit ({dd_state['max_dd']:.2f}% >= {max_drawdown_pct:.2f}%), auto-stopping")
                            blb.push(bot.name, "WARN", "Closing all open positions before stopping — a stopped bot no longer manages SL/TP")
                            self._close_all_open_positions(bot, db, key_records)
                            bot.is_active = False
                            self._drawdown_cache.pop((bot.name, "live"), None)
                            self._drawdown_cache.pop((bot.name, "backtest"), None)
                            db.commit()
                            continue

                    # Reuse indicator computation across bots with identical indicator configs
                    fp = _indicator_fingerprint(bot.settings)
                    if fp not in indicator_cache:
                        eval_tmp = NodeEvaluator(bot.settings)
                        eval_tmp.df = df.copy()
                        eval_tmp._calculate_indicators()
                        indicator_cache[fp] = eval_tmp.df

                    evaluator = NodeEvaluator(bot.settings)
                    evaluator.df = indicator_cache[fp]

                    latest_index = len(evaluator.df) - 1
                    latest_row = evaluator.df.iloc[latest_index]
                    latest_time = _naive_utc(latest_row['timestamp'])

                    current_price = float(latest_row['close'])
                    current_open = float(latest_row['open'])
                    current_high = float(latest_row['high'])
                    current_low = float(latest_row['low'])

                    current_atr = float(evaluator.df['atr'].iloc[latest_index]) if 'atr' in evaluator.df.columns and not pd.isna(evaluator.df['atr'].iloc[latest_index]) else 0.0

                    entry_series = evaluator.resolve_node(bot.settings.get("entry_node")) if bot.settings.get("entry_node") else pd.Series(False, index=evaluator.df.index)
                    exit_series = evaluator.resolve_node(bot.settings.get("exit_node")) if bot.settings.get("exit_node") else pd.Series(False, index=evaluator.df.index)

                    is_buy = bool(entry_series.iloc[-1])
                    is_sell = bool(exit_series.iloc[-1])

                    tick_action = "BUY signal" if is_buy else ("SELL signal" if is_sell else "no signal")
                    blb.push(bot.name, "INFO", f"Tick {symbol} {timeframe} | close {current_price} | {tick_action}")

                    is_api_exec = bot.settings.get("api_execution", False)
                    has_key = bool(bot.settings.get("api_key_name"))
                    mode = "forward_test"
                    api_key_record = None

                    if is_api_exec and has_key:
                        api_key_record = key_records.get(bot.settings.get("api_key_name"))
                        if api_key_record:
                            mode = "paper" if api_key_record.is_sandbox else "live"
                        else:
                            logger.warning("Bot '%s': api_key_name='%s' not found. Running as forward_test.", bot.name, bot.settings.get("api_key_name"))
                            blb.push(bot.name, "WARN", f"API key '{bot.settings.get('api_key_name')}' not found, running as forward_test")

                    # Cache exchange instance per bot cycle to avoid repeated connections
                    _cached_ccxt = None
                    def get_ccxt():
                        nonlocal _cached_ccxt
                        if _cached_ccxt is None and api_key_record:
                            _cached_ccxt = self._get_ccxt_instance(api_key_record)
                            _cached_ccxt.load_markets()
                        return _cached_ccxt

                    max_pos = int(bot.settings.get("max_positions", 1))
                    scope = bot.settings.get("max_positions_scope", "per_pair")

                    # Use pre-loaded positions instead of per-bot DB query
                    bot_positions = [p for p in _positions_by_bot_mode.get((bot.name, mode), []) if p.symbol == symbol]
                    if scope == "per_pair":
                        open_count = len(bot_positions)
                    else:
                        # For global scope, count all modes and all symbols for this bot
                        open_count = sum(len(v) for k, v in _positions_by_bot_mode.items() if k[0] == bot.name)

                    ccxt_symbol = symbol.replace('-', '/').upper()
                    just_opened_ids = set()

                    # Cooldown check using pre-loaded counts
                    cooldown_trades = int(bot.settings.get("cooldown_trades", 0))
                    cooldown_candles = int(bot.settings.get("cooldown_candles", 0))

                    can_buy_cooldown = True
                    if cooldown_trades > 0 and cooldown_candles > 0:
                        recent_buys = _cooldown_counts.get(bot.name, 0)
                        if recent_buys >= cooldown_trades:
                            can_buy_cooldown = False

                    if is_buy and open_count < max_pos and can_buy_cooldown:
                        trade_amount = self._calculate_trade_amount(current_price, bot.settings)
                        if trade_amount is None:
                            logger.warning("Skipping buy for %s: invalid trade amount", symbol)
                        else:
                            try:
                                actual_price = current_price
                                order_id = f"local_{int(latest_time.timestamp())}_{uuid.uuid4().hex[:8]}"

                                buy_fee = 0.0
                                if mode in ["paper", "live"] and api_key_record:
                                    ccxt_inst = get_ccxt()

                                    # A restart replays the last candle: never place a second
                                    # BUY for a candle that already produced one
                                    existing_buy = db.query(Order.id).filter(
                                        Order.bot_name == bot.name, Order.symbol == symbol,
                                        Order.mode == mode, Order.side == "buy",
                                        Order.timestamp == latest_time,
                                    ).first()
                                    if existing_buy:
                                        logger.info("%s BUY for %s @ %s already recorded, skipping duplicate entry", mode.upper(), symbol, latest_time)
                                        continue

                                    # Size trades from the exchange balance, capped at the
                                    # per-bot allocation (backtest_capital)
                                    allocation = float(bot.settings.get("backtest_capital", 1000))
                                    free_balance = self._get_live_capital(ccxt_inst, api_key_record, ccxt_symbol, bot.name)
                                    if free_balance is None:
                                        if mode == "live":
                                            logger.warning("Skipping entry for %s: could not verify exchange balance", symbol)
                                            blb.push(bot.name, "WARN", "Skipping entry: could not verify exchange balance")
                                            continue
                                        sizing_capital = allocation
                                        logger.info("Bot '%s': sandbox balance unavailable, sizing paper entry from allocation $%.2f", bot.name, allocation)
                                    else:
                                        sizing_capital = min(free_balance, allocation)
                                        logger.info("Bot '%s': sizing %s entry from %s $%.2f (free=$%.2f, allocation=$%.2f)",
                                            bot.name, mode, "free balance" if free_balance < allocation else "allocation",
                                            sizing_capital, free_balance, allocation)
                                    trade_amount = self._calculate_trade_amount(current_price, bot.settings, current_equity=sizing_capital)
                                    if trade_amount is None:
                                        logger.warning("Skipping buy for %s: no capital available to size trade", symbol)
                                        continue
                                    trade_amount = float(ccxt_inst.amount_to_precision(ccxt_symbol, trade_amount))
                                    if trade_amount <= 0:
                                        logger.warning("Trade amount rounded to zero for %s after precision, skipping", ccxt_symbol)
                                        continue
                                    min_violation = self._below_market_minimum(ccxt_inst, ccxt_symbol, trade_amount, current_price)
                                    if min_violation:
                                        logger.warning("%s BUY skipped for %s: %s", mode.upper(), symbol, min_violation)
                                        blb.push(bot.name, "WARN", f"{min_violation} — increase trade size")
                                        continue
                                    # Safety guard: reject orders exceeding max_order_value
                                    max_order_usd = float(bot.settings.get("max_order_value", 0))
                                    if max_order_usd > 0:
                                        order_value_usd = trade_amount * current_price
                                        if order_value_usd > max_order_usd:
                                            logger.warning("SAFETY: BUY order $%.2f exceeds max_order_value $%.2f for %s. Skipping.", order_value_usd, max_order_usd, symbol)
                                            continue
                                    okx_order = ccxt_inst.create_market_buy_order(ccxt_symbol, trade_amount)
                                    logger.info("%s BUY response: id=%s status=%s filled=%s avg=%s fee=%s",
                                        mode.upper(), okx_order.get("id"), okx_order.get("status"),
                                        okx_order.get("filled"), okx_order.get("average"), okx_order.get("fee"))
                                    okx_order = self._reconcile_order(ccxt_inst, okx_order, ccxt_symbol)
                                    filled_qty = float(okx_order.get("filled") or 0)
                                    if filled_qty <= 0 and okx_order.get("status") != "closed":
                                        if self._cancel_unfilled_order(ccxt_inst, okx_order.get("id"), ccxt_symbol):
                                            logger.warning("%s BUY unfilled (status=%s), canceled on exchange.", mode.upper(), okx_order.get("status"))
                                            db.add(Order(exchange=exchange, bot_name=bot.name, mode=mode, symbol=symbol, side="buy", order_type="market", price=current_price, amount=trade_amount, timestamp=latest_time, exchange_order_id=okx_order.get("id"), status="canceled"))
                                            db.commit()
                                            continue
                                        # Cancel did not go through: the order may have filled
                                        # after the last poll. Book the position conservatively
                                        # at the requested amount so it stays tracked.
                                        logger.error("%s BUY state unknown for %s (id=%s) — booking position at requested amount, verify on the exchange", mode.upper(), symbol, okx_order.get("id"))
                                        blb.push(bot.name, "ERROR", f"BUY order state unknown on {symbol} — position booked at requested amount/last price, verify manually on the exchange")
                                    # Book the position for what actually filled, even
                                    # when the exchange still reports the order as open
                                    if filled_qty > 0:
                                        trade_amount = filled_qty
                                    actual_price = okx_order.get("average") or okx_order.get("price") or current_price
                                    order_id = okx_order.get("id")
                                    buy_fee = self._fee_in_quote(okx_order.get("fee"), ccxt_symbol, actual_price)
                                    # A fee charged in base currency comes out of the bought
                                    # amount itself; only the net amount is actually held
                                    fee_info = okx_order.get("fee") or {}
                                    base_ccy = ccxt_symbol.split('/')[0]
                                    if fee_info.get("currency") and str(fee_info["currency"]).upper() == base_ccy.upper():
                                        try:
                                            base_fee_cost = float(fee_info.get("cost") or 0)
                                        except (TypeError, ValueError):
                                            base_fee_cost = 0.0
                                        if base_fee_cost > 0:
                                            net_amount = float(ccxt_inst.amount_to_precision(ccxt_symbol, max(trade_amount - base_fee_cost, 0)))
                                            if net_amount > 0:
                                                trade_amount = net_amount
                                    self._balance_cache.pop((api_key_record.name, ccxt_symbol.split('/')[-1]), None)

                                # Position created after successful exchange order
                                open_position = Position(exchange=exchange, bot_name=bot.name, symbol=symbol, mode=mode, status="open", side="long", entry_price=actual_price, amount=trade_amount)
                                db.add(open_position)
                                db.flush()
                                just_opened_ids.add(open_position.id)

                                db.add(Order(position_id=open_position.id, exchange=exchange, bot_name=bot.name, mode=mode, symbol=symbol, side="buy", order_type="market", price=actual_price, amount=trade_amount, timestamp=latest_time, exchange_order_id=order_id, status="filled", fee=buy_fee))
                                if mode in ["paper", "live"]:
                                    # A real exchange fill must be persisted immediately —
                                    # a later rollback may not erase the record of it
                                    db.commit()
                                logger.info("%s BUY Filled @ %s", mode.upper(), actual_price)
                                blb.push(bot.name, "INFO", f"{mode.upper()} BUY {symbol} @ {actual_price}")

                            except ccxt.InsufficientFunds as e:
                                logger.warning("%s BUY rejected (insufficient funds): %s", mode.upper(), e)
                                blb.push(bot.name, "WARN", f"{mode.upper()} BUY rejected: insufficient funds")
                                db.add(Order(exchange=exchange, bot_name=bot.name, mode=mode, symbol=symbol, side="buy", order_type="market", price=current_price, amount=trade_amount, timestamp=latest_time, status="rejected"))
                                if mode in ["paper", "live"]:
                                    db.commit()
                            except Exception as e:
                                logger.error("%s BUY failed: %s", mode.upper(), e, exc_info=True)
                                blb.push(bot.name, "ERROR", f"{mode.upper()} BUY failed: {e}")
                                db.add(Order(exchange=exchange, bot_name=bot.name, mode=mode, symbol=symbol, side="buy", order_type="market", price=current_price, amount=trade_amount, timestamp=latest_time, status="canceled"))
                                if mode in ["paper", "live"]:
                                    db.commit()

                    # Use pre-loaded positions (already includes orders via selectinload)
                    active_positions = bot_positions

                    for pos in active_positions:
                        if not bot.is_active: break
                        if pos.id in just_opened_ids: continue

                        exit_events = self._check_exits(pos, current_price, current_high, current_low, is_sell, bot.settings, current_atr, row_open=current_open)

                        # Track original amount for weighted profit_pct
                        # Use the sum of all buy orders as the original position size
                        pos_original_amount = sum(
                            o.amount for o in (pos.orders or []) if o.side == "buy" and o.status == "filled"
                        ) or pos.amount

                        for ev in exit_events:
                            if pos.amount <= 0: break

                            if ev.get('close_amount_type') == 'fixed':
                                close_qty = min(ev['qty_pct'], pos.amount)
                            else:
                                close_qty = pos.amount * (ev['qty_pct'] / 100)
                            close_qty = min(close_qty, pos.amount)
                            if close_qty <= 0: continue

                            try:
                                actual_price = ev['price']
                                order_id = f"local_{int(latest_time.timestamp())}_{uuid.uuid4().hex[:8]}"

                                actual_fee = 0.0
                                if mode in ["paper", "live"] and api_key_record:
                                    ccxt_inst = get_ccxt()
                                    close_qty = float(ccxt_inst.amount_to_precision(ccxt_symbol, close_qty))
                                    if close_qty <= 0:
                                        logger.warning("Sell amount rounded to zero for %s after precision, skipping", ccxt_symbol)
                                        continue
                                    min_violation = self._below_market_minimum(ccxt_inst, ccxt_symbol, close_qty, ev['price'])
                                    if min_violation:
                                        if self._below_market_minimum(ccxt_inst, ccxt_symbol, pos.amount, ev['price']):
                                            # The whole remainder can never be sold on the
                                            # exchange; close the position administratively
                                            # instead of retrying a doomed sell forever
                                            logger.warning("%s position remainder on %s unsellable (%s) — closing administratively", mode.upper(), symbol, min_violation)
                                            blb.push(bot.name, "WARN", f"Position remainder on {symbol} below exchange minimum ({min_violation}) — closed administratively, dust remains on the exchange")
                                            pos.status = "closed"
                                            pos.closed_at = latest_time
                                            self._update_drawdown(bot.name, "live", pos.profit_abs)
                                            with self._position_states_lock:
                                                self.position_states.pop(pos.id, None)
                                            db.commit()
                                            break
                                        logger.warning("%s SELL skipped for %s: %s", mode.upper(), symbol, min_violation)
                                        blb.push(bot.name, "WARN", f"Sell on {symbol} skipped: {min_violation}")
                                        continue
                                    okx_order = ccxt_inst.create_market_sell_order(ccxt_symbol, close_qty)
                                    logger.info("%s SELL response: id=%s status=%s filled=%s avg=%s fee=%s",
                                        mode.upper(), okx_order.get("id"), okx_order.get("status"),
                                        okx_order.get("filled"), okx_order.get("average"), okx_order.get("fee"))
                                    okx_order = self._reconcile_order(ccxt_inst, okx_order, ccxt_symbol)
                                    filled_qty = float(okx_order.get("filled") or 0)
                                    if filled_qty <= 0 and okx_order.get("status") != "closed":
                                        if self._cancel_unfilled_order(ccxt_inst, okx_order.get("id"), ccxt_symbol):
                                            logger.warning("%s SELL unfilled (status=%s), canceled on exchange.", mode.upper(), okx_order.get("status"))
                                            db.add(Order(position_id=pos.id, exchange=exchange, bot_name=bot.name, mode=mode, symbol=symbol, side="sell", order_type="market", price=ev['price'], amount=close_qty, timestamp=latest_time, exchange_order_id=okx_order.get("id"), status="canceled"))
                                            db.commit()
                                            continue
                                        # Cancel did not go through: the sell may still fill on
                                        # the exchange. Keep the position amount untouched and
                                        # stop the bot — a second sell here could double-sell.
                                        logger.error("%s SELL state unknown for %s (id=%s) — stopping bot '%s'", mode.upper(), symbol, okx_order.get("id"), bot.name)
                                        blb.push(bot.name, "ERROR", f"Order state unknown on {symbol} — verify manually on the exchange before restarting")
                                        db.add(Order(position_id=pos.id, exchange=exchange, bot_name=bot.name, mode=mode, symbol=symbol, side="sell", order_type="market", price=ev['price'], amount=close_qty, timestamp=latest_time, exchange_order_id=okx_order.get("id"), status="unknown"))
                                        bot.is_active = False
                                        db.commit()
                                        break
                                    # Book only what actually sold so a partial fill
                                    # reduces the position pro rata instead of being
                                    # retried for the full amount later
                                    if filled_qty > 0:
                                        close_qty = min(filled_qty, close_qty)
                                    actual_price = okx_order.get("average") or okx_order.get("price") or ev['price']
                                    order_id = okx_order.get("id")
                                    actual_fee = self._fee_in_quote(okx_order.get("fee"), ccxt_symbol, actual_price)
                                    self._balance_cache.pop((api_key_record.name, ccxt_symbol.split('/')[-1]), None)

                                db.add(Order(position_id=pos.id, exchange=exchange, bot_name=bot.name, mode=mode, symbol=symbol, side="sell", order_type="market", price=actual_price, amount=close_qty, timestamp=latest_time, exchange_order_id=order_id, status="filled", fee=actual_fee))

                                # Fee-adjusted P&L: subtract proportional entry fee + exit fee
                                total_buy_fees = sum((o.fee or 0.0) for o in (pos.orders or []) if o.side == "buy" and o.status == "filled")
                                entry_fee_portion = total_buy_fees * (close_qty / pos_original_amount) if pos_original_amount > 0 else 0.0
                                realized_pnl = (actual_price - pos.entry_price) * close_qty - entry_fee_portion - actual_fee
                                pos.profit_abs = (pos.profit_abs or 0.0) + realized_pnl

                                # Weighted profit_pct: fee-adjusted, based on portion of original position
                                if pos_original_amount > 0:
                                    entry_cost_for_qty = pos.entry_price * close_qty + entry_fee_portion
                                    portion_pct = (realized_pnl / entry_cost_for_qty) * 100 if entry_cost_for_qty > 0 else 0.0
                                    weight = close_qty / pos_original_amount
                                    pos.profit_pct = (pos.profit_pct or 0.0) + (portion_pct * weight)

                                with self._position_states_lock:
                                    if pos.id in self.position_states:
                                        self.position_states[pos.id]['triggered_exits'].add(ev['id'])
                                        pos.triggered_exits = list(self.position_states[pos.id]['triggered_exits'])

                                if close_qty >= pos.amount - 0.00001:
                                    pos.status = "closed"
                                    pos.closed_at = latest_time
                                    self._update_drawdown(bot.name, "live", pos.profit_abs)
                                    with self._position_states_lock:
                                        self.position_states.pop(pos.id, None)
                                else:
                                    pos.amount -= close_qty

                                if mode in ["paper", "live"]:
                                    # A real exchange fill must be persisted immediately —
                                    # a later rollback may not erase the record of it
                                    db.commit()

                                logger.info("%s SELL (%s) Filled @ %s", mode.upper(), ev['reason'], actual_price)
                                blb.push(bot.name, "INFO", f"{mode.upper()} SELL [{ev['reason']}] {symbol} @ {actual_price}")
                            except Exception as e:
                                logger.error("%s SELL failed: %s", mode.upper(), e, exc_info=True)
                                blb.push(bot.name, "ERROR", f"{mode.upper()} SELL failed: {e}")
                                db.add(Order(position_id=pos.id, exchange=exchange, bot_name=bot.name, mode=mode, symbol=symbol, side="sell", order_type="market", price=current_price, amount=close_qty, timestamp=latest_time, status="rejected"))
                                if mode in ["paper", "live"]:
                                    db.commit()

                    standard_cols = ['id', 'timestamp', 'open', 'high', 'low', 'close', 'volume', 'atr']
                    indicators = { col: float(latest_row[col]) for col in evaluator.df.columns if col not in standard_cols and not pd.isna(latest_row[col]) }

                    if indicators:
                        action_str = "buy" if is_buy else ("sell" if is_sell else "neutral")
                        live_ts = latest_time
                        if hasattr(live_ts, 'to_pydatetime'):
                            live_ts = live_ts.to_pydatetime()
                        _pending_signals.append({"cid": int(latest_row['id']), "sym": symbol, "ts": str(live_ts), "bn": bot.name, "nm": "STRATEGY_TICK", "act": action_str, "ed": json.dumps(indicators)})

                # ── Single batch commit for all signals and position/order changes ──
                if _pending_signals:
                    for sig_params in _pending_signals:
                        db.execute(
                            text("INSERT OR IGNORE INTO signals (candle_id, symbol, timestamp, bot_name, name, action, extra_data) VALUES (:cid, :sym, :ts, :bn, :nm, :act, :ed)"),
                            sig_params
                        )
                db.commit()

            except Exception as e:
                logger.error("Error executing live bot strategy: %s", e, exc_info=True)
                db.rollback()
            finally:
                db.close()

        await asyncio.to_thread(run_logic)

    def mark_deleted(self, bot_name: str):
        """Mark a bot as deleted so _process_bots skips it."""
        self._deleted_bots.add(bot_name)
        self._drawdown_cache.pop((bot_name, "live"), None)
        self._drawdown_cache.pop((bot_name, "backtest"), None)
        # Purge position states for this bot to prevent memory accumulation
        try:
            db = SessionLocal()
            pos_ids = {p.id for p in db.query(Position.id).filter(Position.bot_name == bot_name).all()}
            db.close()
            with self._position_states_lock:
                for pid in pos_ids:
                    self.position_states.pop(pid, None)
        except Exception:
            pass

    def unmark_deleted(self, bot_name: str):
        """Remove deletion marker after cleanup is complete."""
        self._deleted_bots.discard(bot_name)

    def stop(self):
        self.running = False
        logger.info("Bot Manager stopped.")

bot_manager = BotManager()
