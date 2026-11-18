import { StatusMessage } from '../shared/ui/Messages';
import { appText } from '../shared/i18n/pt-PT';
export default function Loading(){return <main aria-busy="true"><StatusMessage>{appText.loading}</StatusMessage></main>;}
