import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | vacantNEU",
  description: "Privacy Policy for vacantNEU.",
};

const EFFECTIVE_DATE = "September 3, 2026";
const CONTACT = "dukediamondd@gmail.com";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 pt-12 pb-24 sm:px-8 sm:pt-16">
      <div className="legal">
        <h1 className="display-lg text-3xl font-semibold sm:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-ink-muted">Effective date: {EFFECTIVE_DATE}</p>

        <p className="mt-8">
          vacantNEU (&ldquo;the Application,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
          &ldquo;our&rdquo;) helps students find classrooms with no class scheduled in them. This
          policy explains what information the Application handles and what it does not.
        </p>

        <h2>The short version</h2>
        <p>
          <strong>vacantNEU has no accounts and collects no personal information about you.</strong>{" "}
          There is nothing to sign in to, no email address or phone number is requested, and no
          profile is built. The only thing we measure is how many times pages are viewed, in
          aggregate, without cookies.
        </p>

        <h2>1. Information we collect</h2>

        <h3>Aggregate traffic counts</h3>
        <p>
          We use a privacy-preserving analytics service to count page views so we know whether the
          Application is being used. This service is configured to operate without cookies and
          without cross-site tracking. It records events such as the page visited, the referring
          site, and coarse information such as country, browser, and device type. It does not store
          a persistent identifier for you, and we cannot use it to identify an individual or follow
          a person between sessions.
        </p>

        <h3>Server logs</h3>
        <p>
          Like any website, the servers that deliver the Application may record standard request
          logs, which can include IP address, user agent, and requested path. These logs exist for
          security and troubleshooting, are handled by our hosting provider, and are not used to
          build a profile of you.
        </p>

        <h2>2. Information we do not collect</h2>
        <ul>
          <li>Names, email addresses, phone numbers, or student identifiers.</li>
          <li>Northeastern credentials. There is no sign-in of any kind.</li>
          <li>
            Your searches or the rooms you look at. All searching and filtering happens in your
            browser, and those queries are never sent to us.
          </li>
          <li>
            Your location. The map&rsquo;s locate button uses your browser&rsquo;s geolocation and
            the result stays on your device.
          </li>
          <li>Advertising or cross-site tracking identifiers. There are none.</li>
        </ul>

        <h2>3. How the Application works with your data</h2>
        <p>
          The class schedule is downloaded to your browser as a single file, and all availability is
          calculated on your device against your clock. That design is why your searches never reach
          us: there is no query for us to log.
        </p>

        <h2>4. Third parties that receive a request from your browser</h2>
        <p>
          Loading a web page necessarily reveals your IP address to whoever serves it. The following
          third parties receive a request when you use the Application:
        </p>
        <ul>
          <li>
            <strong>Our hosting provider,</strong> which serves the site itself.
          </li>
          <li>
            <strong>OpenFreeMap,</strong> which serves the map tiles on the map page only. If you
            never open the map, no request is made to it.
          </li>
          <li>
            <strong>Our analytics provider,</strong> which receives the page view event described
            above.
          </li>
        </ul>
        <p>
          Fonts are served from our own domain rather than a font provider, so no third-party font
          service sees your visit.
        </p>

        <h2>5. How we use information</h2>
        <ul>
          <li>To understand how many people use the Application and which pages they use.</li>
          <li>To diagnose errors and keep the Application working.</li>
          <li>To comply with applicable law.</li>
        </ul>
        <p>We do not use any information for advertising or profiling.</p>

        <h2>6. Sharing</h2>
        <p>
          <strong>We do not sell or share personal information,</strong> and we have none to sell.
          Beyond the service providers listed above, information is disclosed only if required by
          law or where necessary to protect the rights, property, or safety of users or the public.
        </p>

        <h2>7. Retention</h2>
        <p>
          Aggregate analytics are retained by our analytics provider under its own retention policy
          and contain no identifier for you. Hosting request logs are short lived and retained by
          our hosting provider for security and troubleshooting. Because we hold no user accounts,
          there is no account data to retain or delete.
        </p>

        <h2>8. Your rights</h2>
        <p>
          Depending on where you live, you may have rights under laws such as the GDPR or the
          CCPA/CPRA to access, correct, delete, port, or restrict processing of your personal
          information, and to object to processing or withdraw consent.
        </p>
        <p>
          In practice, we hold no information that identifies you, so in most cases there is nothing
          for us to retrieve, correct, or delete. If you believe we hold information about you, or
          you want to ask about our practices, write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>{" "}
          and we will respond within the time required by applicable law. We will never discriminate
          against you for exercising these rights.
        </p>

        <h2>9. Security</h2>
        <p>
          The Application is a static site and stores no user data, which removes most of the risk
          normally associated with a web service. No method of transmission over the internet is
          completely secure, and we cannot guarantee absolute security.
        </p>

        <h2>10. International transfers</h2>
        <p>
          The Application is hosted and operated in the United States. If you use it from outside
          the United States, the limited information described above is processed there.
        </p>

        <h2>11. Children&rsquo;s privacy</h2>
        <p>
          The Application is intended for university students and is not directed at children under
          13. We do not knowingly collect personal information from children, and because the
          Application collects no personal information from anyone, none is collected from children.
        </p>

        <h2>12. Non-affiliation with Northeastern University</h2>
        <p>
          vacantNEU is an independent project and is not affiliated with, endorsed, sponsored, or
          approved by Northeastern University. This policy covers data handled by vacantNEU, not by
          Northeastern.
        </p>

        <h2>13. Changes to this policy</h2>
        <p>
          We may update this policy. Changes take effect when posted here, and the effective date at
          the top will be updated. Please review it periodically.
        </p>

        <h2>14. Contact</h2>
        <p>
          Questions about this policy can be sent to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </div>
    </main>
  );
}
