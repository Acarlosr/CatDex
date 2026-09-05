/**
 * Bundled example strategies — mirrors of the files in the repo's `examples/`
 * directory (there are more there). Each entry is a ready-to-POST payload for
 * `/api/bots/import`.
 */
import rsiDipHunter from './RSI_Dip_Hunter.apex.json';
import emaTrendRider from './EMA_Trend_Rider.apex.json';
import bollingerBounce from './Bollinger_Bounce.apex.json';

export const EXAMPLE_BOTS = [
  {
    id: 'rsi-dip-hunter',
    name: 'RSI Dip Hunter',
    description: 'Buys RSI dips above the 200 EMA trend, exits on overbought.',
    payload: rsiDipHunter,
  },
  {
    id: 'ema-trend-rider',
    name: 'EMA Trend Rider',
    description: 'Rides trends using an EMA crossover entry and exit.',
    payload: emaTrendRider,
  },
  {
    id: 'bollinger-bounce',
    name: 'Bollinger Bounce',
    description: 'Mean-reversion bounces off the lower Bollinger band.',
    payload: bollingerBounce,
  },
];
