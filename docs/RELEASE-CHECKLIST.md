# DesignerFlow – staging and security checklist

## Status
Development branch only; the live app continues to use `main`.
Firebase project remains as configured in `index.html`. There is no backend for anonymous submissions.

## Before merging
1. Preserve a private JSON backup of the existing account (do not upload it to public GitHub).
2. Verify that Firebase Authentication Email/Password is enabled and that the Firestore Rules tab uses secure owner-only rules.
3. **Manually publish** `firestore.rules` to the matching Firebase project. Committing the file does **not** deploy rules.
4. Test a real account on computer and phone, using the same email. Confirm project creation and successful synced state after reload.
5. Test different test accounts to prove there is no cross-account local-data leakage.
6. Turn off Wi-Fi, edit a test record, reconnect, wait for successful cloud acknowledgement, and confirm another device receives it.
7. Open the public client form from Settings *after* setting the destination WhatsApp number. Confirm the correct address opens and that the client must manually send the message.
8. Verify manual JSON export and import into a **test** account first.
9. Run `npm test`, and check GitHub Actions quality workflow.

## Important current limitations
- Firestore persists each top-level category as one document holding an array. Concurrent edits to different records in the same category can still conflict. A later release must migrate to `users/{uid}/{category}/{recordId}` with a versioned migration.
- Offline support depends on browser storage availability and Firebase persistence. Storage rejection or quota exhaustion can prevent offline protection. Test on every target browser.
- Public client requests are **WhatsApp-only**. They are not saved in Firestore and are not considered delivered until the customer taps Send in WhatsApp. A secure inbound API with abuse prevention is needed for direct form submissions.
- The upload of contract signatures as base64 in a document can exceed Firestore document size limits. Future signatures should be stored in access-controlled object storage.
- Cloud synchronization is **not** an independent, immutable backup. Manual JSON exports remain necessary.
- The old single-key `designerAppDB_v3` cache is NOT automatically imported into new accounts. Use manual JSON import after signing into the correct account to avoid cross-account contamination.

## Public Git history
A previously tracked JSON backup containing customer data was removed from the main and development branch tips. Old commits may still expose it; deleting a file does not erase history. A separate controlled history rewrite (with collaborators warned and tokens/credentials reviewed) is required to remove it from history. Do not upload any further client exports into Git.

## Rollback
Leave the live `main` branch unchanged until manual checks pass. If test checks fail, do not merge the PR. Restore the prior commit only after preserving newly entered cloud data and accounting for schema changes.
