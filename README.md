# 🚀 Welcome to REY30 3D Engine

A modern, production-ready web application scaffold tailored for the REY30 3D Engine editor experience.

## ✨ Technology Stack

This scaffold provides a robust foundation built with:

### 🎯 Core Framework
- **⚡ Next.js 16** - The React framework for production with App Router
- **📘 TypeScript 5** - Type-safe JavaScript for better developer experience
- **🎨 Tailwind CSS 4** - Utility-first CSS framework for rapid UI development

### 🧩 UI Components & Styling
- **🧩 shadcn/ui** - High-quality, accessible components built on Radix UI
- **🎯 Lucide React** - Beautiful & consistent icon library
- **🌈 Framer Motion** - Production-ready motion library for React
- **🎨 Next Themes** - Perfect dark mode in 2 lines of code

### 📋 Forms & Validation
- **🎣 React Hook Form** - Performant forms with easy validation
- **✅ Zod** - TypeScript-first schema validation

### 🔄 State Management & Data Fetching
- **🐻 Zustand** - Simple, scalable state management
- **🔄 TanStack Query** - Powerful data synchronization for React
- **🌐 Fetch** - Promise-based HTTP request

### 🗄️ Database & Backend
- **🗄️ Prisma** - Next-generation TypeScript ORM
- **🔐 NextAuth.js** - Complete open-source authentication solution

### 🎨 Advanced UI Features
- **📊 TanStack Table** - Headless UI for building tables and datagrids
- **🖱️ DND Kit** - Modern drag and drop toolkit for React
- **📊 Recharts** - Redefined chart library built with React and D3
- **🖼️ Sharp** - High performance image processing

### 🌍 Internationalization & Utilities
- **🌍 Next Intl** - Internationalization library for Next.js
- **📅 Date-fns** - Modern JavaScript date utility library
- **🪝 ReactUse** - Collection of essential React hooks for modern development

## 🎯 Why This Scaffold?

- **🏎️ Fast Development** - Pre-configured tooling and best practices
- **🎨 Beautiful UI** - Complete shadcn/ui component library with advanced interactions
- **🔒 Type Safety** - Full TypeScript configuration with Zod validation
- **📱 Responsive** - Mobile-first design principles with smooth animations
- **🗄️ Database Ready** - Prisma ORM configured for rapid backend development
- **🔐 Auth Included** - NextAuth.js for secure authentication flows
- **📊 Data Visualization** - Charts, tables, and drag-and-drop functionality
- **🌍 i18n Ready** - Multi-language support with Next Intl
- **🚀 Production Ready** - Optimized build and deployment settings
- **🤖 AI-Friendly** - Structured codebase perfect for AI assistance

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Build for production
pnpm run build

# Start production server
pnpm run start
```

`pnpm run start` expects production environment variables to already be present in the process.
For a local production-like boot that loads workspace env files, runs migrations, builds, and starts the standalone server, use `pnpm run start:production:local`.

Open [http://localhost:3000](http://localhost:3000) to see your application running.

## Windows Launcher Policy

- The repo keeps a single maintained batch launcher: `start-clean-app.bat`.
- Do not add duplicate `.bat` entrypoints for new modes.
- Extend `start-clean-app.bat` with flags instead, for example:
  - `start-clean-app.bat --production-local`
  - `start-clean-app.bat --semi-production-local`

See [docs/BATCH_SCRIPT_POLICY.md](docs/BATCH_SCRIPT_POLICY.md).

## 🔒 Security Environment Notes

- In production, define `REY30_ENCRYPTION_KEY` (recommended), `APP_ENCRYPTION_KEY`, or `NEXTAUTH_SECRET`.
- This key is a server encryption key (not an OpenAI/Meshy/Runway API key).
- Even with BYOK per-user, the server encryption key is required to securely store each user's provider secrets.
- Generate a secure key with: `pnpm run security:generate-secret`
- Validate dependency version floors with: `pnpm run security:deps`
- Keep the encryption key stable. Rotating it without a migration will break decryption of stored provider secrets.
- Production rate limiting now requires `REY30_UPSTASH_REDIS_REST_URL` and `REY30_UPSTASH_REDIS_REST_TOKEN` for auth and cost-heavy API routes by default.
- Signed integrations also use that shared Upstash backend for cross-instance nonce replay protection when it is configured.
- Only for intentional single-instance deployments, you can opt into in-memory production fallback with `REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION=true`.
- The local `seal:final` rehearsal can auto-bootstrap a mock Upstash-compatible backend plus a local smoke user; that convenience is only for local verification and does not replace real production credentials.
- `release:check` now includes `security:deps`, so CI blocks if `next`, `next-intl` or selected transitive security-sensitive packages fall below the pinned minimum versions.
- Login and registration use tighter public rate limits; tune them with `REY30_RATE_LIMIT_AUTH_WINDOW_MS`, `REY30_RATE_LIMIT_LOGIN_MAX_REQUESTS`, and `REY30_RATE_LIMIT_REGISTER_MAX_REQUESTS`.
- For remote asset imports via `/api/assets`, define `REY30_REMOTE_FETCH_ALLOWLIST_ASSETS` with a comma-separated list of allowed hostnames (for example: `cdn.example.com,assets.example.org`).
- Without that asset allowlist, remote imports are blocked by design.
- Local AI providers (`ollama`, `vllm`, `llamacpp`) are now restricted to server loopback only, and only on explicit host:port allowlists.
- Default local endpoints are `localhost:11434`, `localhost:8000`, and `localhost:8080`; extend them intentionally with `REY30_LOCAL_PROVIDER_ALLOWLIST_OLLAMA`, `REY30_LOCAL_PROVIDER_ALLOWLIST_VLLM`, and `REY30_LOCAL_PROVIDER_ALLOWLIST_LLAMACPP`.
- In production, enabling those local providers is blocked by default unless you run in `REY30_LOCAL_OWNER_MODE=true` or explicitly opt in with `REY30_LOCAL_PROVIDER_ALLOW_REMOTE=true`.
- Keep `REY30_TRUST_PROXY` disabled by default. Enable it only when running behind a trusted reverse proxy that sanitizes forwarded IP headers like `x-forwarded-for` and `x-real-ip`.
- Runtime scripts are sandboxed with AST checks and loop guard budgets; dynamic `obj[key]` access is blocked unless `key` is a numeric index.
- Authenticated API mutations now enforce CSRF (`x-rey30-csrf` must match `rey30_csrf` cookie). Login/register remain bootstrap-exempt.
- Los eventos críticos de auditoría (`login`, `register`, `token`, cambios de configuración y decisiones ops`) intentan persistir en DB y, si esa escritura falla, caen a un store duradero local para no perder trazabilidad.
- `REY30_REGISTRATION_MODE` now defaults to `invite_only` in all environments. Use `open` or `allowlist` explicitly if needed.
- Local development registration stays closed unless `REY30_ALLOW_DEV_LOCAL_REGISTRATION=true`.
- In `open` mode, registration is local-only by default; set `REY30_ALLOW_OPEN_REGISTRATION_REMOTE=true` to allow remote open signup.
- First-user OWNER bootstrap requires `REY30_BOOTSTRAP_OWNER_TOKEN`; without it, registration creates `VIEWER` users only.
- `/api/terminal` is disabled by default in all environments; enable with `REY30_ENABLE_TERMINAL_API=true`. Remote access remains blocked unless `REY30_ENABLE_TERMINAL_API_REMOTE=true`.

## 👥 BYOK Multi-User Model

- Users register and configure their own provider API keys in `Config APIs`.
- The platform does not provide shared provider keys.
- Quotas, governance and audit events are tracked per user/project.

## Shared Token Mode

- The app also supports a no-login shared access mode for collaborators.
- Auth is handled with `REY30_SHARED_ACCESS_TOKEN`.
- Shared-token sessions stay in collaborator/`VIEWER` scope even if legacy env files still set a higher role.
- OpenAI and Meshy can come from server-managed credentials instead of per-user BYOK.
- Editor and ops routes still require normal `EDITOR` / `OWNER` sessions.
- The shared/invite OpenAI credential can be rotated with:
  - `$env:INVITE_PROFILE_OPENAI_API_KEY="sk-proj-tu-clave-nueva"`
  - `npx tsx scripts/rotate-invite-openai-key.ts`
- Guide: [docs/SHARED_ACCESS_TOKEN.md](/C:/Users/rey30/REY30_3dengine/docs/SHARED_ACCESS_TOKEN.md)

## Netlify + Neon

- The repo is now prepared to consume `NETLIFY_DATABASE_URL` automatically when Netlify DB provisions a Neon Postgres database.
- `@netlify/neon` is installed so Netlify can provision the database for a linked site during `netlify dev` or `netlify build`.
- `@netlify/blobs` is installed and Script Workspace now auto-switches to Netlify Blobs on Netlify runtimes, while keeping filesystem storage for local development and tests.
- Gallery now also auto-switches to Netlify Blobs on Netlify runtimes, while keeping filesystem storage for local development and local imports.
- Modular Character Lab now uses the same hybrid persistence strategy: filesystem locally and Netlify Blobs in Netlify runtimes when configured.
- Prisma and the production scripts still use `DATABASE_URL` internally, but the repo now aliases `NETLIFY_DATABASE_URL` to `DATABASE_URL` when the Netlify variable is the only one present.
- One important limit remains:
  - Netlify + Neon solves the relational database layer.
  - Script persistence is now covered through Netlify Blobs.
  - Gallery persistence is now covered through Netlify Blobs.
  - Modular Character Lab persistence is covered for its own packages and metadata.
  - Assets, packages, and backups still need external persistent storage because the app currently assumes writable local paths.

Setup guide: [docs/NETLIFY_NEON_SETUP.md](/C:/Users/rey30/REY30_3dengine/docs/NETLIFY_NEON_SETUP.md)

Modular Character Lab guide: [docs/MODULAR_CHARACTER_LAB.md](/C:/Users/rey30/REY30_3dengine/docs/MODULAR_CHARACTER_LAB.md)

## 🤖 AI-Assisted Workflow

This project is designed to work well with AI-assisted development workflows for:

- **💻 Code Generation** - Generate components, pages, and features instantly
- **🎨 UI Development** - Create beautiful interfaces with AI assistance  
- **🔧 Bug Fixing** - Identify and resolve issues with intelligent suggestions
- **📝 Documentation** - Auto-generate comprehensive documentation
- **🚀 Optimization** - Performance improvements and best practices

Ready to build something amazing? Start chatting with Z.ai at [chat.z.ai](https://chat.z.ai) and experience the future of AI-powered development!

## 📁 Project Structure

```
src/
├── app/                 # Next.js App Router pages
├── components/          # Reusable React components
│   └── ui/             # shadcn/ui components
├── hooks/              # Custom React hooks
└── lib/                # Utility functions and configurations
```

## 🎨 Available Features & Components

This scaffold includes a comprehensive set of modern web development tools:

### 🧩 UI Components (shadcn/ui)
- **Layout**: Card, Separator, Aspect Ratio, Resizable Panels
- **Forms**: Input, Textarea, Select, Checkbox, Radio Group, Switch
- **Feedback**: Alert, Toast (Sonner), Progress, Skeleton
- **Navigation**: Breadcrumb, Menubar, Navigation Menu, Pagination
- **Overlay**: Dialog, Sheet, Popover, Tooltip, Hover Card
- **Data Display**: Badge, Avatar, Calendar

### 📊 Advanced Data Features
- **Tables**: Powerful data tables with sorting, filtering, pagination (TanStack Table)
- **Charts**: Beautiful visualizations with Recharts
- **Forms**: Type-safe forms with React Hook Form + Zod validation

### 🎨 Interactive Features
- **Animations**: Smooth micro-interactions with Framer Motion
- **Drag & Drop**: Modern drag-and-drop functionality with DND Kit
- **Theme Switching**: Built-in dark/light mode support

### 🔐 Backend Integration
- **Authentication**: Ready-to-use auth flows with NextAuth.js
- **Database**: Type-safe database operations with Prisma
- **API Client**: HTTP requests with Fetch + TanStack Query
- **State Management**: Simple and scalable with Zustand

### 🌍 Production Features
- **Internationalization**: Multi-language support with Next Intl
- **Image Optimization**: Automatic image processing with Sharp
- **Type Safety**: End-to-end TypeScript with Zod validation
- **Essential Hooks**: 100+ useful React hooks with ReactUse for common patterns

## 🤝 Get Started with REY30

1. **Clone this scaffold** to jumpstart your project
2. **Open your preferred AI tooling** if you want assisted development
3. **Start building** with intelligent code generation and assistance
4. **Deploy with confidence** using the production-ready setup

Production deployment checklist: [docs/production-checklist.md](/C:/Users/rey30/REY30_3dengine/docs/production-checklist.md)

Render blueprint prep: [docs/RENDER_DEPLOY_READY.md](/C:/Users/rey30/REY30_3dengine/docs/RENDER_DEPLOY_READY.md)

Netlify + Neon prep: [docs/NETLIFY_NEON_SETUP.md](/C:/Users/rey30/REY30_3dengine/docs/NETLIFY_NEON_SETUP.md)

Netlify mini checklist: [docs/NETLIFY_MINI_CHECKLIST.md](/C:/Users/rey30/REY30_3dengine/docs/NETLIFY_MINI_CHECKLIST.md)

Netlify env example: [docs/NETLIFY_ENV_EXAMPLE.md](/C:/Users/rey30/REY30_3dengine/docs/NETLIFY_ENV_EXAMPLE.md)

---

Built for the REY30 developer workflow.

