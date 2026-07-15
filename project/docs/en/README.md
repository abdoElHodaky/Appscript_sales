# Sales Order Management System

A comprehensive sales and order management system built on Google Workspace.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Mobile    │ ←→  │   AppSheet   │ ←→  │   Sheets    │
│   Web       │     │   (UI)       │     │   (Data)    │
└─────────────┘     └──────────────┘     └─────────────┘
                            ↓
                    ┌──────────────┐
                    │ Apps Script  │
                    │ (Automation) │
                    └──────────────┘
```

## Features

- Order management (New → Processing → Shipped → Completed)
- Customer database with search
- Real-time dashboard
- Automated notifications (Email + WhatsApp)
- Inventory tracking
- Role-based access control

## Security

- XSS protection
- Input validation
- Rate limiting
- Secret management via PropertiesService
- Shannon pentest validated
- Code review completed

## Quick Start

```bash
npm install -g @google/clasp
clasp login
npm install
npm run setup
npm run push
```

## License

MIT
