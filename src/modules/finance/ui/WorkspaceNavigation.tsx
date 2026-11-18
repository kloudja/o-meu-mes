import { Icon } from '../../../shared/ui/Icon';
import { navigation, type Screen } from '../i18n/pt-PT';
export function WorkspaceNavigation({
  screen,
  openReminders,
  onNavigate,
}: {
  screen: Screen;
  openReminders: number;
  onNavigate: (screen: Screen) => void;
}) {
  return (
    <nav aria-label="Navegação principal">
      {navigation.map((n) => (
        <button
          key={n.id}
          aria-label={n.label}
          className={screen === n.id ? 'active' : ''}
          onClick={() => onNavigate(n.id)}
          aria-current={screen === n.id ? 'page' : undefined}
        >
          <Icon name={n.icon} />
          <span>{n.label}</span>
          {n.id === 'recurring' && <em>{openReminders}</em>}
        </button>
      ))}
    </nav>
  );
}
