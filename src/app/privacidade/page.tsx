import '@/modules/identity/ui/identity.css';

export const dynamic = 'force-dynamic';
export default function PrivacyNotice() {
  const configured = process.env.OMEUMES_RIGHTS_CONTACT;
  const contact = configured && /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(configured) ? configured : null;
  return (
    <main className="auth-main auth-shell">
      <article className="auth-card">
        <h1>Privacidade dos convites</h1>
        <p>Informação de desenvolvimento para ensaios locais com dados sintéticos.</p>
        <p>
          O proprietário de um espaço indica o email da pessoa que pretende convidar. O serviço usa esse
          endereço para reservar o convite à conta cujo email confirmado corresponda.
        </p>
        <p>
          Se aceitares, o proprietário e os restantes membros veem o teu nome e papel no espaço. A aceitação
          dá-te acesso a todo o histórico. A aplicação não envia o convite.
        </p>
        <p>
          Enquanto o convite estiver ativo, o endereço fica cifrado. Após a expiração, aceitação ou revogação,
          os metadados técnicos são conservados até 30 dias para controlo e confirmação.
        </p>
        <h2>Exercer os teus direitos</h2>
        <p>
          Nas definições do utilizador, abre Privacidade e direitos para apresentar um pedido, esclarecer o
          seu alcance e consultar a resposta. Podes fazê-lo depois de sair de um espaço.
        </p>
        {contact ? (
          <p>
            Se já não consegues entrar, contacta o responsável por <a href={'mailto:' + contact}>{contact}</a>
            . Descreve o pedido sem enviar movimentos ou documentos de identificação.
          </p>
        ) : (
          <p>O contacto externo do responsável fica pendente para a abertura do serviço.</p>
        )}
        <a href="/">Voltar a O meu mês</a>
      </article>
    </main>
  );
}
