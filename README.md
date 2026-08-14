# Marketing Journey Dashboard (Payload CMS)

A specialized Marketing CRM and Journey Tracking dashboard built with **Payload 3.0**, **Next.js**, and **PostgreSQL**. This system tracks client lifecycles, marketing funnel engagement via OneSignal pathways, and regional campaign performance.

## Tech Stack
- **Framework:** Next.js (App Router)
- **CMS:** Payload 3.0
- **Database:** PostgreSQL
- **Environment:** Docker / Node 20+
- **Styling:** Vanilla CSS

---

## 🛠 Local Development

For the best development experience, it is recommended to run the application locally using **pnpm**. Docker is reserved for production environments.

### 1. Prerequisites
- [Node.js](https://nodejs.org/) 20.x or higher
- [pnpm](https://pnpm.io/) 9.x or higher
- [PostgreSQL](https://www.postgresql.org/) (You can run only the database in Docker if needed)

### 2. Setup
1. **Initialize Environment Variables:**
   ```bash
   cp .env.example .env  # If not already present
   ```
   Ensure your `DATABASE_URL` is set to your local Postgres instance.

2. **Install Dependencies:**
   ```bash
   pnpm install
   ```

3. **Start Development Server:**
   ```bash
   pnpm dev
   ```

4. **Access the Admin Panel:**
   Visit [http://localhost:3000/admin](http://localhost:3000/admin).

---

## 🚀 Production Deployment

This project is containerized for professional production deployments using Docker.

### 1. Build & Start (Docker Compose)
The provided `docker-compose.yml` uses the `Dockerfile` to create an optimized standalone build.

```bash
docker compose up --build -d
```

This will spin up both the Next.js application (on port 3001) and the PostgreSQL database.

### 2. Manual Production Build
If you need to build and start without Docker:
```bash
pnpm build
pnpm start
```

---

### 3. Environment Configuration
Required environment variables for production:
- `DATABASE_URL`: Connection string for your production PostgreSQL instance.
- `PAYLOAD_SECRET`: A long, random string used for encryption and JWT signing.
- `NEXT_PUBLIC_PAYLOAD_URL`: The public-facing URL of your dashboard.
- `NEXT_PUBLIC_PAYLOAD_API_KEY`: API key for public frontend access.

*Note: Ensure your production infrastructure handles Postgres backups and SSL termination.*

---

## 📂 Project Structure
- `/src/collections`: Core data models (Clients, JourneyTracking, Reports).
- `/src/app/(frontend)`: Frontend dashboard UI.
- `/src/payload.config.ts`: Main Payload CMS configuration.
- `docker-compose.yml`: Local infrastructure setup.

## 📈 Collections Overview
- **Clients:** CRM tracking for client lifecycle (Region, Tier, Status).
- **JourneyTracking:** Monitors active marketing pathways and engagement steps.
- **Reports:** Aggregated performance data (Sent, Delivered, Open Rates, CTR).

---

## Questions?
Reach out to the development team or check the internal documentation for specific marketing journey logic.
