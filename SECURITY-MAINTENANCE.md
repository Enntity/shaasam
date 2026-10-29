# Security maintenance

The October 29 patch is based on the deployed restricted-Twilio revision d5a74ef. It contains no marketplace migration. Production images must not be rolled back to a version requiring the revoked broad Twilio credential.

The build workflow publishes images but does not deploy or prune them. Promote a tested immutable digest deliberately, retaining the current image and Compose file, and recreate only the selected services. Verify health, database ping, login, unauthenticated human-route rejection, and the actual Node/Next/sharp versions. If a check fails, restore the retained image/config and repeat those checks. Preserve current database contents on binary rollback.

The host runs the shared Enntity five-minute defense monitor and nightly Trivy image/OS scan. The independent hourly security-monitor workflow checks the public routes, timers, inventory freshness, image coverage, and bounded authentication/error signals using the existing production SSH secrets. It does not send SMS or invoke payment providers. The local chat watch remains paused.
