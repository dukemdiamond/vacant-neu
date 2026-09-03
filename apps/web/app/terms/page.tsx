import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms and Conditions | vacantNEU",
  description: "Terms and Conditions for vacantNEU.",
};

const EFFECTIVE_DATE = "September 3, 2026";
const CONTACT = "dukediamondd@gmail.com";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 pt-12 pb-24 sm:px-8 sm:pt-16">
      <div className="legal">
        <h1 className="display-lg text-3xl font-semibold sm:text-4xl">Terms and Conditions</h1>
        <p className="mt-3 text-sm text-ink-muted">Effective date: {EFFECTIVE_DATE}</p>

        <p className="mt-8">
          Welcome to vacantNEU (&ldquo;the Application,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo;
          or &ldquo;our&rdquo;). The Application helps students at Northeastern University
          (&ldquo;Northeastern&rdquo;) find classrooms that have no class scheduled in them, using
          room and meeting-time information from Northeastern&rsquo;s publicly accessible course
          catalog.
        </p>
        <p>
          By accessing or using the Application, you (&ldquo;User,&rdquo; &ldquo;you,&rdquo;
          &ldquo;your&rdquo;) agree to be bound by these Terms and Conditions (&ldquo;Terms&rdquo;).
          If you do not agree to these Terms, you may not access or use the Application.
        </p>

        <h2>1. Description of the service</h2>
        <p>vacantNEU provides a website that:</p>
        <ul>
          <li>
            Reads room, day, time, and date information for scheduled class meetings from
            Northeastern&rsquo;s publicly accessible Banner course catalog.
          </li>
          <li>
            Displays, for each classroom, whether a class is currently scheduled in it and when the
            next scheduled class begins.
          </li>
          <li>Lets you search and filter classrooms by building, room number, and availability.</li>
          <li>Shows a campus map of buildings with the number of rooms currently free in each.</li>
        </ul>
        <p>
          The Application does not offer user accounts, does not require you to sign in, and does
          not send notifications of any kind.
        </p>

        <h2>2. Acceptance of terms</h2>
        <p>
          By using any part of the Application, you signify your unconditional acceptance of these
          Terms. We may modify these Terms at any time. Material changes will be reflected by an
          updated effective date on this page. Your continued use of the Application after a change
          constitutes acceptance of the revised Terms.
        </p>

        <h2>3. No accounts and no personal data</h2>
        <p>
          The Application has no login, no registration, and no user profiles. We do not ask you for
          your name, email address, phone number, or student identifier, and we do not collect them.
          See our <a href="/privacy">Privacy Policy</a> for the limited, aggregate information we do
          collect.
        </p>

        <h2>4. Availability information is not a guarantee of access</h2>
        <p>
          <strong>
            A room shown as open is a room with no class scheduled in it. That is not the same as a
            room that is unlocked, empty, or available to you.
          </strong>{" "}
          This distinction is the single most important limitation of the Application, and you
          accept it as a condition of use.
        </p>
        <p>Specifically, the course catalog does not describe, and the Application cannot know:</p>
        <ul>
          <li>
            Club meetings, department events, study sessions, interviews, or other non-class
            bookings held in a room.
          </li>
          <li>
            Examinations, which follow a separate schedule that Northeastern does not publish
            through the same source.
          </li>
          <li>Whether a building or room is physically locked, or whether access is restricted.</li>
          <li>Rooms that exist but have never had a class scheduled in them.</li>
          <li>Last-minute room changes, cancellations, or closures.</li>
        </ul>
        <p>
          You are responsible for respecting posted signage, building access rules, and the
          instructions of Northeastern staff. Do not enter, occupy, or remain in any space you are
          not permitted to use.
        </p>

        <h2>5. Non-affiliation with Northeastern University</h2>
        <ul>
          <li>
            <strong>Independent service.</strong> vacantNEU is an independent project and is not
            affiliated with, endorsed, sponsored, or approved by Northeastern University.
          </li>
          <li>
            <strong>Data source.</strong> Class meeting information is read from publicly available
            Northeastern systems. We do not control that source data and cannot correct it.
          </li>
          <li>
            <strong>Official information.</strong> For definitive course, room, registration, and
            facilities information, you must refer to official Northeastern resources and staff.
          </li>
          <li>
            <strong>Trademarks.</strong> Any use of Northeastern&rsquo;s name or marks is
            descriptive and for identification only, and does not imply endorsement or affiliation.
          </li>
        </ul>

        <h2>6. No guarantees and disclaimer of warranties</h2>
        <ul>
          <li>
            <strong>Provided as is.</strong> The Application and its content are provided on an
            &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis, without warranties of any
            kind, express or implied.
          </li>
          <li>
            <strong>Data accuracy.</strong> Schedule data is copied periodically from
            Northeastern&rsquo;s systems and may be incomplete, outdated, or wrong. The Application
            shows the date of its most recent update. Always verify against official sources before
            relying on it.
          </li>
          <li>
            <strong>Availability.</strong> We do not guarantee the Application will be
            uninterrupted, error free, or secure, and it may be unavailable without notice.
          </li>
        </ul>

        <h2>7. Acceptable use</h2>
        <p>You agree not to use the Application to:</p>
        <ul>
          <li>Violate any applicable local, state, national, or international law.</li>
          <li>Interfere with or disrupt the Application or the infrastructure serving it.</li>
          <li>
            Attempt to gain unauthorized access to any part of the Application or to any systems or
            networks connected to it.
          </li>
          <li>
            Place automated or excessive load on the Application or on Northeastern&rsquo;s systems
            through it.
          </li>
          <li>
            Gain or attempt to gain physical access to any campus space you are not authorized to
            enter.
          </li>
        </ul>

        <h2>8. Intellectual property</h2>
        <p>
          The software, design, and interface of the Application are the property of its author.
          Course and room data belongs to Northeastern University. Map data is provided by
          OpenStreetMap contributors under the Open Database License.
        </p>

        <h2>9. Third-party services</h2>
        <p>
          The Application loads map tiles from OpenFreeMap and may load a privacy-preserving traffic
          counter, as described in the <a href="/privacy">Privacy Policy</a>. We do not control
          these services and are not responsible for their content or practices. Your use of the
          Application is also subject to their terms.
        </p>

        <h2>10. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, in no event shall vacantNEU or its author be
          liable for any indirect, incidental, special, consequential, or punitive damages, or for
          any loss arising from:
        </p>
        <ul>
          <li>Your access to, use of, or inability to use the Application.</li>
          <li>
            Reliance on room availability information, including any wasted journey, missed
            deadline, or denial of physical access to a space.
          </li>
          <li>Any error, omission, or delay in the underlying course catalog data.</li>
          <li>Any conduct or content of a third party in connection with the Application.</li>
        </ul>

        <h2>11. Indemnification</h2>
        <p>
          You agree to defend, indemnify, and hold harmless vacantNEU and its author from any
          claims, liabilities, damages, losses, and expenses, including reasonable legal fees,
          arising out of your use of the Application or your violation of these Terms.
        </p>

        <h2>12. Changes to the service</h2>
        <p>
          We may change, suspend, or discontinue the Application, in whole or in part, at any time
          and without notice or liability.
        </p>

        <h2>13. Privacy</h2>
        <p>
          Your use of the Application is also governed by our <a href="/privacy">Privacy Policy</a>,
          which is incorporated into these Terms by reference.
        </p>

        <h2>14. Governing law</h2>
        <p>
          These Terms are governed by the laws of the Commonwealth of Massachusetts, United States,
          without regard to its conflict of law provisions.
        </p>

        <h2>15. Severability and entire agreement</h2>
        <p>
          If any provision of these Terms is found unenforceable, that provision will be limited or
          removed to the minimum extent necessary and the remaining Terms will stay in effect. These
          Terms, together with the Privacy Policy, are the entire agreement between you and
          vacantNEU regarding the Application.
        </p>

        <h2>16. Contact</h2>
        <p>
          Questions about these Terms can be sent to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </div>
    </main>
  );
}
