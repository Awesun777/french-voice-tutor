import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";

const LAST_UPDATED = "July 30, 2026";
const CONTACT_EMAIL = "admin@poruscap.com";

/**
 * Public privacy policy for RomainTalk (romaintalk.com).
 *
 * This page must stay reachable at a stable public URL (/privacy) because it is
 * linked from the Google OAuth consent screen and is required for Google's
 * sensitive-scope verification. It discloses exactly what Google user data the
 * app accesses, why, and includes the Google API Services Limited Use statement.
 */
export default function PrivacyPolicy() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <button
          onClick={() => setLocation("/")}
          className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to app
        </button>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-8 leading-relaxed text-[15px] text-foreground/90">
          <section className="space-y-3">
            <p>
              RomainTalk ("we", "us", or the "App") is a French vocabulary and
              pronunciation learning tool available at{" "}
              <span className="font-medium">romaintalk.com</span>. This Privacy Policy
              explains what information we collect, how we use it, and the choices you
              have. By using the App, you agree to the practices described here.
            </p>
            <p>
              We are the sole operator of the App. If you have any questions, contact us
              at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">1. Information We Collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="font-medium">Account information.</span> When you sign
                in with Google, we receive your Google account's unique identifier, email
                address, name, and profile picture. We use this to create and identify
                your account.
              </li>
              <li>
                <span className="font-medium">Google user data.</span> With your
                permission, the App accesses certain data from your Google account through
                Google APIs. See Section 3 for the specific scopes and how each is used.
              </li>
              <li>
                <span className="font-medium">Study content.</span> Vocabulary words,
                translations, notes, star/favorite flags, and spaced-repetition review
                history that you create or import in the App.
              </li>
              <li>
                <span className="font-medium">Voice recordings.</span> If you use the
                pronunciation practice or voice-conversation features, we process the
                audio you record in order to transcribe it and give you feedback.
              </li>
              <li>
                <span className="font-medium">Technical data.</span> Standard information
                such as your session cookie and basic request logs needed to operate and
                secure the service.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To authenticate you and keep you signed in.</li>
              <li>To store and display your vocabulary library and study progress.</li>
              <li>
                To import vocabulary from a Google Doc you choose, and to export your
                library back to a Google Doc in your Drive (see Section 3).
              </li>
              <li>
                To transcribe your recorded speech and generate spoken French audio so you
                can practice pronunciation and conversation.
              </li>
              <li>To maintain, secure, debug, and improve the App.</li>
            </ul>
            <p>
              We do <span className="font-medium">not</span> sell your personal
              information, and we do not use it for advertising.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">3. Google User Data and API Scopes</h2>
            <p>
              The App requests only the Google permissions it needs to provide its
              features. You are shown these permissions on Google's consent screen and can
              decline or revoke them at any time.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 pr-4 font-semibold align-top">Permission</th>
                    <th className="py-2 font-semibold align-top">Why we request it</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  <tr className="border-b border-border/60">
                    <td className="py-2 pr-4 font-mono text-xs">openid, email, profile</td>
                    <td className="py-2">
                      To sign you in and show your name, email, and avatar in the App.
                    </td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="py-2 pr-4 font-mono text-xs">
                      .../auth/documents.readonly
                    </td>
                    <td className="py-2">
                      Read-only access to a Google Doc that <span className="font-medium">you</span>{" "}
                      choose to import from. We read the document's text solely to extract
                      the vocabulary entries you want to study. We never modify it.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-xs">.../auth/drive.file</td>
                    <td className="py-2">
                      Access limited to files the App itself creates. We use it to create
                      and update a single Google Doc in your Drive that RomainTalk creates
                      to export your vocabulary library. We cannot see any other files in
                      your Drive.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              We store Google authentication tokens (including a refresh token) so the App
              can perform the actions above on your behalf without asking you to sign in
              repeatedly. These tokens are stored securely and are used only for the
              purposes described here.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">4. Limited Use Disclosure</h2>
            <p>
              RomainTalk's use and transfer of information received from Google APIs
              will adhere to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. We do not use Google user data for
              serving advertisements, and we do not sell it or transfer it to third parties
              except as necessary to provide or improve the App's features, comply with
              applicable law, or as part of a merger or acquisition. Human access to Google
              user data occurs only with your explicit consent, for security purposes, to
              comply with applicable law, or where the data has been aggregated and
              anonymized.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">5. How Your Information Is Shared</h2>
            <p>
              We share data only with the service providers that power the App's features,
              and only as needed to deliver those features:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="font-medium">OpenAI</span> — to transcribe your recorded
                speech and to process French text for learning features.
              </li>
              <li>
                <span className="font-medium">ElevenLabs</span> — to generate spoken French
                audio for pronunciation and voice-conversation practice.
              </li>
              <li>
                <span className="font-medium">DeepSeek and Google AI</span> — to process
                text for vocabulary parsing, translation, and related learning features.
              </li>
              <li>
                <span className="font-medium">Amazon Web Services (S3)</span> — to store
                audio you record for transcription.
              </li>
              <li>
                <span className="font-medium">Railway</span> — our application hosting and
                database provider.
              </li>
            </ul>
            <p>
              These providers process data on our behalf under their own terms and privacy
              policies. We may also disclose information if required by law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">6. Data Retention</h2>
            <p>
              We keep your account and study data for as long as your account is active.
              Audio recordings are used to produce transcriptions and are not retained
              longer than needed for that purpose. When you delete your account, we delete
              your associated personal data and revoke stored Google tokens, except where
              we must retain limited information to comply with legal obligations.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">7. Data Security</h2>
            <p>
              We use industry-standard measures to protect your information, including
              encrypted connections (HTTPS) and access controls. No method of transmission
              or storage is completely secure, but we work to protect your data and limit
              access to it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">8. Your Choices and Rights</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <span className="font-medium">Revoke Google access</span> at any time from
                your Google Account at{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  myaccount.google.com/permissions
                </a>
                . This stops the App from accessing your Google data going forward.
              </li>
              <li>
                <span className="font-medium">Access or delete your data.</span> You can
                request access to, correction of, or deletion of your personal data by
                contacting us at{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">
                  {CONTACT_EMAIL}
                </a>
                .
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">9. Children's Privacy</h2>
            <p>
              The App is not directed to children under 13, and we do not knowingly collect
              personal information from them. If you believe a child has provided us
              information, contact us and we will delete it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">10. International Users</h2>
            <p>
              The App may be operated from, and your information processed in, countries
              other than your own. By using the App, you consent to this transfer and
              processing.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we do, we will
              revise the "Last updated" date above. Continued use of the App after changes
              take effect constitutes acceptance of the updated policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">12. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or how we handle your data,
              email us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
