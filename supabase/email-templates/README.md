# Cross-browser email authentication

Apply these bodies in Supabase Authentication → Email Templates:

| Template | File |
| --- | --- |
| Magic Link | `magic-link.html` |
| Confirm signup | `confirm-signup.html` |
| Reset Password | `reset-password.html` |

Set the Authentication Site URL to `https://mealplan.yoursouthernfoodie.com` before applying. Save the existing templates so this configuration change can be reversed.

The deployed `/auth/confirm` handler already calls `verifyOtp` for `token_hash` links, so these links establish a session in the browser that opens them without a PKCE verifier from the requesting browser. OAuth continues to use PKCE. No migration or application deployment is required. Sign-in and signup links use the handler's customer/admin destination; recovery opens the password reset page. Links remain single-use and retain the project's configured expiration.

After applying, request fresh links and test sign-in, signup confirmation, and password recovery from a second browser with no existing session. Check that replaying a consumed link fails and that recovery reaches `/account/password`. Previously issued code-based links retain their original browser requirement. Email scanners may consume direct verification links; if observed, introduce a confirmation page requiring a user action before verification.

Reference: https://supabase.com/docs/guides/auth/auth-email-passwordless
