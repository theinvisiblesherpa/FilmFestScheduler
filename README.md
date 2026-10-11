# PFF35 Schedule

## Run locally

```sh
cd src/web
npm ci
npm run dev
```

## Build and run the container locally

From the repository root:

```sh
docker build -t pff35-schedule .
docker run --rm -p 8080:8080 pff35-schedule
```

Open <http://localhost:8080>. The container serves the Vite build with Nginx,
supports client-side route fallback, and exposes a `/healthz` health endpoint.

## Deploy releases to Cloud Run

The GitHub Actions workflow builds and pushes an image to Artifact Registry
and deploys it publicly to Cloud Run when a commit is pushed to `main`, when a
version tag matching `v*` is pushed, or when manually run with **Actions →
Build, deploy, and release → Run workflow**. A GitHub release is created only
for version-tag runs.

One-time GCP setup:

1. Enable the Cloud Run, Artifact Registry, and IAM Credentials APIs.
2. Create a Docker Artifact Registry repository in the region where the Cloud
   Run service will run.
3. Configure Workload Identity Federation for GitHub Actions, restricted to
   this repository, and grant its service account permission to impersonate it.
4. Grant the deployment service account `roles/artifactregistry.writer` on the
   repository, `roles/run.admin` on the project, and
   `roles/iam.serviceAccountUser` on the Cloud Run runtime service account.

For example, after setting `PROJECT_ID`, `PROJECT_NUMBER`, `REGION`,
`REPOSITORY`, `OWNER`, and `REPO` to your values:

```sh
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com \
  --project "$PROJECT_ID"

gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker --location "$REGION" --project "$PROJECT_ID"

gcloud iam workload-identity-pools create github-actions \
  --location=global --display-name="GitHub Actions" --project "$PROJECT_ID"
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global \
  --workload-identity-pool=github-actions \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '${OWNER}/${REPO}'" \
  --project "$PROJECT_ID"

gcloud iam service-accounts create github-deployer --project "$PROJECT_ID"
DEPLOYER="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-actions/attribute.repository/${OWNER}/${REPO}" \
  --project "$PROJECT_ID"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER}" --role="roles/run.admin"
gcloud artifacts repositories add-iam-policy-binding "$REPOSITORY" \
  --location "$REGION" \
  --member="serviceAccount:${DEPLOYER}" \
  --role="roles/artifactregistry.writer" --project "$PROJECT_ID"
gcloud iam service-accounts add-iam-policy-binding \
  "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --member="serviceAccount:${DEPLOYER}" \
  --role="roles/iam.serviceAccountUser" --project "$PROJECT_ID"
```

Use the provider resource name
`projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions/providers/github`
as `GCP_WIF_PROVIDER`. The commands grant the GitHub deployment identity access
only to the selected repository via the provider condition.

Set these GitHub Actions **variables** in the repository:

| Variable | Description |
| --- | --- |
| `GCP_PROJECT_ID` | GCP project ID |
| `GCP_REGION` | Artifact Registry and Cloud Run region |
| `GCP_ARTIFACT_REGISTRY_REPOSITORY` | Existing Docker repository name |
| `GCP_CLOUD_RUN_SERVICE` | Cloud Run service and container image name |

Set these GitHub Actions **secrets**:

| Secret | Description |
| --- | --- |
| `GCP_WIF_PROVIDER` | Full Workload Identity Provider resource name |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | Email address of the deployment service account |

Push to `main` to deploy automatically. To create a versioned GitHub release,
push a version tag:

```sh
git tag v1.0.0
git push origin v1.0.0
```

The workflow intentionally grants unauthenticated access so the schedule can be
viewed publicly. Remove `--allow-unauthenticated` from the workflow if the
Cloud Run service should require authentication.