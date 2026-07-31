# Google Cloud Compute Engine example

Create an Ubuntu LTS Compute Engine VM with a static external IP, permit TCP 80/443 in a narrow firewall rule, and attach a persistent disk for Docker volumes and encrypted backups. Install Docker Engine plus the Compose plugin, clone the release artifact, provision Docker secrets on the VM, configure DNS, then use the normal production deployment script.

Google Secret Manager is optional: a deployment operator may fetch each secret with a workload identity, write it to a temporary file with mode `0400`, create or rotate the corresponding Docker secret, and delete the temporary file. The core application does not require Google Cloud APIs or credentials.
