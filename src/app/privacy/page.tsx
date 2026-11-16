import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './privacy.module.css';

export const metadata: Metadata = {
  title: 'Privacy policy — Zero Web Finder',
  description: 'How Zero Web Finder uses business records and the owner’s connected Gmail account.',
};

export default function PrivacyPage() {
  return <main className={styles.page}>
    <article className={styles.document}>
      <header className={styles.header}>
        <Link href="/login" className={styles.brand}>Zero Web Finder</Link>
        <span>Private business workspace</span>
      </header>
      <p className={styles.eyebrow}>PRIVACY POLICY · UPDATED 16 NOVEMBER 2026</p>
      <h1>Your information in this workspace</h1>
      <p className={styles.intro}>Zero Web Finder is a single-owner app for managing business leads, approved email campaigns, follow-up tasks, and project status. It is operated by the owner of <a href="mailto:afiqamri03@gmail.com">afiqamri03@gmail.com</a>.</p>

      <section aria-labelledby="records">
        <h2 id="records">Business records</h2>
        <p>The owner adds or imports contacts, or discovers publicly available business information. Stored records can include business names, contact details, website and source links, notes, contact verification, campaign content, sending history, tasks, project values, and opt-out preferences. These records support the owner’s sales workflow and are accessible through the password-protected workspace.</p>
      </section>

      <section aria-labelledby="gmail">
        <h2 id="gmail">How Gmail access is used</h2>
        <p>The owner authorizes Google access directly with Google. This app does not ask for or store the owner’s Gmail password.</p>
        <ul>
          <li><strong>Gmail send access (<code>gmail.send</code>)</strong> sends campaigns approved by the owner, subject to the app’s sending controls and contact exclusions.</li>
          <li><strong>Gmail read access (<code>gmail.readonly</code>)</strong> verifies the connected account and checks metadata in Gmail conversations linked to campaign messages. Sender headers and timestamps help detect replies and stop follow-ups.</li>
        </ul>
        <p>The app stores outgoing campaign content, Gmail message and thread identifiers, reply-check times, and reply status. This implementation does not import the mailbox or save received message bodies or attachments in the workspace. Replies are read and answered in Gmail.</p>
      </section>

      <section aria-labelledby="storage">
        <h2 id="storage">Storage and service providers</h2>
        <p>The hosted app runs on Render and stores workspace records in PostgreSQL. Google processes Gmail authorization and email requests. These services process the data needed to operate the app; the owner can access workspace records and the connected Gmail account.</p>
        <p>OAuth client credentials and the refresh token are kept in private server configuration. Short-lived access tokens are held in server memory. Public pages do not expose these credentials. An essential session cookie keeps the owner signed in, and hosting services may record routine connection and request logs.</p>
        <p>Gmail data is used for the email features described here. The app does not sell Gmail data, use it for advertising or AI model training, or send it to third-party AI services.</p>
      </section>

      <section aria-labelledby="choices">
        <h2 id="choices">Retention and your choices</h2>
        <p>Workspace records remain in the database until the owner removes them; the app has no automatic deletion schedule. The owner can revoke Gmail access through <a href="https://myaccount.google.com/connections">Google Account connections</a>. Revoking access stops future Gmail access but does not delete existing workspace records or messages already sent through Gmail.</p>
        <p>Recipients can use the unsubscribe link in campaign emails to stop further outreach. An opt-out record is retained to prevent new campaigns from contacting that address. For questions, corrections, or a request to remove information, contact <a href="mailto:afiqamri03@gmail.com">afiqamri03@gmail.com</a>.</p>
      </section>

      <footer className={styles.footer}><Link href="/login">Return to owner sign-in</Link><span>This page is public. Workspace records are private.</span></footer>
    </article>
  </main>;
}
