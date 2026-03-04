# Frontend — colas-turnos

Panel de administración (TailAdmin + React 19 + Vite + Tailwind). Base para vistas Root, Clínica, Recepción y Pantalla (Idea-Central).

## Requisitos

- Node.js 18+

## Instalación

```bash
cd frontend
npm install
```

## Desarrollo

```bash
npm run dev
```

Abre http://localhost:5173 (o el puerto que indique Vite). El backend API corre por defecto en otro puerto (ej. 3000); configura la URL base en variables de entorno cuando integres el login.

## Estructura

```
frontend/
├── src/
│   ├── app/          # (pendiente) Rutas por módulo
│   ├── components/
│   ├── context/
│   ├── layout/
│   ├── pages/        # Dashboard, Auth, Tables, Charts...
│   └── ...
├── public/
├── index.html
├── package.json
└── vite.config.ts
```
