import { useLanguage } from '../i18n.jsx';

export default function HowToUse() {
  const { language } = useLanguage();
  const isPTBR = language === 'pt-BR';

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center">
            <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text">
              {isPTBR ? '🐱 Como usar o CatDex' : '🐱 How to use CatDex'}
            </h1>
            <p className="text-sm text-muted">
              {isPTBR 
                ? 'Sua plataforma de trading algorítmico auto-hospedada, segura e multi-idioma' 
                : 'Your self-hosted, secure and multi-language algorithmic trading platform'}
            </p>
          </div>
        </div>
      </div>

      {/* Intro */}
      <div className="bg-accent/10 border border-accent/40 rounded-lg p-4 mb-6 flex items-start gap-3">
        <svg className="w-5 h-5 text-accent shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-sm text-text leading-relaxed">
          <p>
            {isPTBR 
              ? 'Bem-vindo ao CatDex – sua plataforma de trading algorítmico auto-hospedada, segura e agora com suporte a dois idiomas (PT-BR/EN).'
              : 'Welcome to CatDex – your self-hosted, secure algorithmic trading platform now with support for two languages (PT-BR/EN).'}
          </p>
        </div>
      </div>

      {/* Content Sections */}
      <div className="space-y-6">
        
        {/* Section 1: Connect with API Key */}
        <section className="bg-raised border border-border rounded-lg p-6">
          <h2 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
            <span className="text-2xl">🔑</span>
            {isPTBR ? '1. Conecte-se com sua chave API' : '1. Connect with your API key'}
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              {isPTBR 
                ? 'Na tela inicial, cole sua MASTER_API_KEY (gerada no servidor, em data/.env).'
                : 'On the initial screen, paste your MASTER_API_KEY (generated on the server, in data/.env).'}
            </p>
            <p>
              {isPTBR 
                ? 'Clique em ENTRAR para desbloquear o terminal.'
                : 'Click SIGN IN to unlock the terminal.'}
            </p>
            <div className="bg-inset border border-border rounded-lg p-4">
              <p className="text-xs text-accent">
                <strong>
                  {isPTBR ? '🔐 Segurança:' : '🔐 Security:'}
                </strong>{' '}
                {isPTBR 
                  ? 'Suas chaves nunca saem do servidor – tudo roda localmente.'
                  : 'Your keys never leave the server – everything runs locally.'}
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Choose Strategy */}
        <section className="bg-raised border border-border rounded-lg p-6">
          <h2 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
            <span className="text-2xl">🎯</span>
            {isPTBR ? '2. Escolha sua estratégia' : '2. Choose your strategy'}
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              {isPTBR 
                ? 'Você pode carregar uma estratégia pronta (ex: EMA_Cross_4h.apex.json) ou criar a sua do zero usando o construtor visual.'
                : 'You can load a ready-made strategy (e.g., EMA_Cross_4h.apex.json) or create your own from scratch using the visual builder.'}
            </p>
            <p>
              {isPTBR 
                ? 'O CatDex suporta múltiplos ativos e exchanges (Binance, KuCoin, OKX, etc.).'
                : 'CatDex supports multiple assets and exchanges (Binance, KuCoin, OKX, etc.).'}
            </p>
            <div className="grid md:grid-cols-3 gap-3 mt-4">
              <div className="bg-inset border border-border rounded-lg p-3 text-center">
                <span className="text-lg mb-1 block">📊</span>
                <p className="text-xs font-semibold text-text">
                  {isPTBR ? 'Estratégias Prontas' : 'Ready Strategies'}
                </p>
              </div>
              <div className="bg-inset border border-border rounded-lg p-3 text-center">
                <span className="text-lg mb-1 block">🧩</span>
                <p className="text-xs font-semibold text-text">
                  {isPTBR ? 'Construtor Visual' : 'Visual Builder'}
                </p>
              </div>
              <div className="bg-inset border border-border rounded-lg p-3 text-center">
                <span className="text-lg mb-1 block">🌐</span>
                <p className="text-xs font-semibold text-text">
                  {isPTBR ? 'Múltiplas Exchanges' : 'Multiple Exchanges'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Configure Parameters */}
        <section className="bg-raised border border-border rounded-lg p-6">
          <h2 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
            <span className="text-2xl">⚙️</span>
            {isPTBR ? '3. Configure os parâmetros' : '3. Configure parameters'}
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-accent shrink-0">•</span>
                <span>
                  {isPTBR 
                    ? 'Defina o par de moedas (ex: HYPE/USDC).'
                    : 'Define the trading pair (e.g., HYPE/USDC).'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent shrink-0">•</span>
                <span>
                  {isPTBR 
                    ? 'Ajuste o intervalo de tempo (timeframe): 1m, 5m, 15m, 30m, 1h, 4h, 1d...'
                    : 'Adjust the timeframe: 1m, 5m, 15m, 30m, 1h, 4h, 1d...'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent shrink-0">•</span>
                <span>
                  {isPTBR 
                    ? 'Configure gerenciamento de risco (stop-loss, take-profit, drawdown).'
                    : 'Set up risk management (stop-loss, take-profit, drawdown).'}
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Section 4: Backtest */}
        <section className="bg-raised border border-border rounded-lg p-6">
          <h2 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
            <span className="text-2xl">📈</span>
            {isPTBR ? '4. Faça um backtest (teste histórico)' : '4. Run a backtest (historical test)'}
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              {isPTBR 
                ? 'Clique em Run Backtest para simular com dados reais do passado.'
                : 'Click Run Backtest to simulate with real historical data.'}
            </p>
            <p>
              {isPTBR 
                ? 'Analise o gráfico de equidade (a "montanha-russa").'
                : 'Analyze the equity chart (the "roller coaster").'}
            </p>
            <p>
              {isPTBR 
                ? 'Se o resultado for bom, você pode ativar o modo Paper Trading (dinheiro fictício) antes de operar ao vivo.'
                : 'If the result is good, you can enable Paper Trading mode (fake money) before going live.'}
            </p>
            <div className="bg-info/10 border border-info/40 rounded-lg p-4 mt-3">
              <p className="text-xs text-info">
                <strong>💡 {isPTBR ? 'Dica:' : 'Tip:'}</strong>{' '}
                {isPTBR 
                  ? 'Sempre teste em backtest + paper trading por pelo menos 1-4 semanas antes de ir live.'
                  : 'Always test in backtest + paper trading for at least 1-4 weeks before going live.'}
              </p>
            </div>
          </div>
        </section>

        {/* Section 5: Live Execution */}
        <section className="bg-raised border border-warn/30 rounded-lg p-6">
          <h2 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            {isPTBR ? '5. Execute ao vivo (opcional)' : '5. Execute live (optional)'}
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              {isPTBR 
                ? 'Quando estiver confiante, mude para Live Execution.'
                : 'When you are confident, switch to Live Execution.'}
            </p>
            <p>
              {isPTBR 
                ? 'O CatDex executa ordens automaticamente usando sua chave API (leitura e escrita).'
                : 'CatDex executes orders automatically using your API key (read and write).'}
            </p>
            <div className="bg-warn/10 border border-warn/40 rounded-lg p-4 mt-3">
              <p className="text-xs text-warn">
                <strong>⚠️ {isPTBR ? 'Atenção:' : 'Warning:'}</strong>{' '}
                {isPTBR 
                  ? 'Comece com valores baixos (< $100) até ganhar confiança na estratégia. Configure max_drawdown entre 5-15%.'
                  : 'Start with small amounts (< $100) until you gain confidence in the strategy. Set max_drawdown between 5-15%.'}
              </p>
            </div>
          </div>
        </section>

        {/* Section 6: Monitor and Adjust */}
        <section className="bg-raised border border-border rounded-lg p-6">
          <h2 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
            <span className="text-2xl">📊</span>
            {isPTBR ? '6. Acompanhe e ajuste' : '6. Monitor and adjust'}
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              {isPTBR 
                ? 'Monitore posições abertas, lucro/perda e métricas de desempenho.'
                : 'Monitor open positions, profit/loss, and performance metrics.'}
            </p>
            <p>
              {isPTBR 
                ? 'Você pode pausar, parar ou modificar a estratégia a qualquer momento.'
                : 'You can pause, stop, or modify the strategy at any time.'}
            </p>
            <div className="grid md:grid-cols-2 gap-3 mt-4">
              <div className="bg-inset border border-border rounded-lg p-3">
                <h3 className="text-xs font-semibold text-accent mb-2">
                  {isPTBR ? '📍 Posições Abertas' : '📍 Open Positions'}
                </h3>
                <p className="text-xs text-muted">
                  {isPTBR ? 'Veja todas as posições ativas em tempo real' : 'See all active positions in real-time'}
                </p>
              </div>
              <div className="bg-inset border border-border rounded-lg p-3">
                <h3 className="text-xs font-semibold text-success mb-2">
                  {isPTBR ? '💰 Lucro/Perda' : '💰 Profit/Loss'}
                </h3>
                <p className="text-xs text-muted">
                  {isPTBR ? 'Acompanhe o desempenho financeiro do bot' : 'Track the bot\'s financial performance'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section className="bg-raised border border-border rounded-lg p-6">
          <h2 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
            <span className="text-2xl">🔐</span>
            {isPTBR ? 'Segurança e Transparência' : 'Security and Transparency'}
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-success shrink-0">✓</span>
              <p className="text-muted">
                {isPTBR 
                  ? 'Auditado e aprovado em nossa checklist de segurança.'
                  : 'Audited and approved in our security checklist.'}
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-success shrink-0">✓</span>
              <p className="text-muted">
                {isPTBR 
                  ? 'Código-fonte aberto – você pode inspecionar cada linha.'
                  : 'Open-source code – you can inspect every line.'}
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-success shrink-0">✓</span>
              <p className="text-muted">
                {isPTBR 
                  ? 'Nenhum dado é enviado para servidores externos (exceto as próprias exchanges para execução de ordens).'
                  : 'No data is sent to external servers (except the exchanges themselves for order execution).'}
              </p>
            </div>
          </div>
        </section>

        {/* Multi-language Section */}
        <section className="bg-raised border border-border rounded-lg p-6">
          <h2 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
            <span className="text-2xl">🌐</span>
            {isPTBR ? 'Multi-idioma' : 'Multi-language'}
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              {isPTBR 
                ? 'O CatDex agora está disponível em Português e Inglês.'
                : 'CatDex is now available in Portuguese and English.'}
            </p>
            <p>
              {isPTBR 
                ? 'Alterne o idioma clicando na bandeira no rodapé da sidebar (inferior esquerdo).'
                : 'Switch language by clicking the flag in the sidebar footer (lower left).'}
            </p>
            <div className="flex items-center gap-3 bg-inset border border-border rounded-lg p-4 mt-3">
              <span className="text-2xl">🇧🇷</span>
              <span className="text-muted">⟷</span>
              <span className="text-2xl">🇺🇸</span>
              <p className="text-xs text-muted ml-3">
                {isPTBR 
                  ? 'Troca instantânea de idioma' 
                  : 'Instant language switch'}
              </p>
            </div>
          </div>
        </section>

        {/* Documentation Section */}
        <section className="bg-raised border border-border rounded-lg p-6">
          <h2 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
            <span className="text-2xl">📚</span>
            {isPTBR ? 'Documentação' : 'Documentation'}
          </h2>
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              {isPTBR 
                ? 'Guia completo disponível na pasta docs/ do projeto.'
                : 'Complete guide available in the docs/ folder of the project.'}
            </p>
            <div className="bg-inset border border-border rounded-lg p-4 mt-3">
              <p className="text-xs font-mono text-accent mb-2">
                docs/
              </p>
              <ul className="space-y-1 text-xs text-muted">
                <li>• SECURITY_AUDIT_FINDINGS.md</li>
                <li>• I18N_IMPLEMENTATION.md</li>
                <li>• CATDEX_CHANGELOG.md</li>
                <li>• FINAL_SUMMARY.md</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="bg-inset border border-border rounded-lg p-4 mt-8">
          <div className="flex items-start gap-3 text-xs text-muted">
            <svg className="w-5 h-5 shrink-0 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="leading-relaxed">
              <p className="font-semibold text-text mb-1">
                {isPTBR ? '❓ Dúvidas?' : '❓ Questions?'}
              </p>
              <p>
                {isPTBR 
                  ? 'Acesse a documentação completa em '
                  : 'Access the full documentation at '}
                <code className="font-mono bg-bg px-1 rounded text-accent">docs/</code>
                {isPTBR ? ' ou veja os logs do backend para detalhes técnicos.' : ' or check backend logs for technical details.'}
              </p>
              <p className="mt-3 text-text font-semibold">
                {isPTBR 
                  ? '🐱 CatDex – Trading algorítmico simples, seguro e para todos.'
                  : '🐱 CatDex – Simple, secure algorithmic trading for everyone.'}
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
