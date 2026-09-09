import { useLanguage } from '../i18n.jsx';

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  
  const toggleLanguage = () => {
    setLanguage(language === 'pt-BR' ? 'en' : 'pt-BR');
  };
  
  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-2 px-3 py-2 rounded-md bg-overlay hover:bg-overlay-hover border border-border hover:border-border-strong transition-colors duration-200 group"
      title={language === 'pt-BR' ? 'Switch to English' : 'Mudar para Português'}
      aria-label={language === 'pt-BR' ? 'Switch to English' : 'Mudar para Português'}
    >
      <span className="text-lg" role="img" aria-hidden="true">
        {language === 'pt-BR' ? '🇧🇷' : '🇺🇸'}
      </span>
      <span className="text-xs font-medium text-muted group-hover:text-text transition-colors duration-200">
        {language === 'pt-BR' ? 'PT' : 'EN'}
      </span>
    </button>
  );
}
