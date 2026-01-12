# Documentation Index

Complete documentation index for Claims IQ.

## 📚 Main Documentation

### [README.md](../README.md)
**Start here!** Overview, quick start, architecture, and core features.

### [Complete Feature Documentation](./COMPLETE_FEATURE_DOCUMENTATION.md)
Detailed documentation of all features:
- Voice Sketch
- Voice Scope
- Document Processing
- Claim Briefing
- Inspection Workflows
- Estimate Builder
- Photo Analysis
- My Day Dashboard
- Map View
- Calendar Integration
- Route Optimization

### [API Documentation](./API_DOCUMENTATION.md)
Complete API reference:
- Authentication endpoints
- Claims API
- Documents API
- Photos API
- Estimates API
- Workflows API
- Voice Sessions API
- Error responses
- Rate limiting

### [Database Schema](./DATABASE_SCHEMA.md)
Database schema reference:
- Core tables
- Claims tables
- Document tables
- Estimate tables
- Workflow tables
- Relationships
- Indexes
- RLS policies

### [Developer Guide](./DEVELOPER_GUIDE.md)
Development guide:
- Getting started
- Project structure
- Development workflow
- Code standards
- Testing
- Debugging
- Common tasks
- Troubleshooting

### [Quick Reference](./QUICK_REFERENCE.md)
Quick reference for:
- Common commands
- File locations
- Common patterns
- Environment variables
- API endpoints
- Component patterns
- TypeScript types
- Error handling

---

## 🎯 Feature-Specific Documentation

### Voice Features

- [Voice Sketching](./VOICE_SKETCHING.md)
  - Voice-driven floor plan creation
  - Geometry engine
  - Room sketching commands

- [Voice VAD Configuration](./VOICE_VAD_CONFIGURATION.md)
  - Voice Activity Detection settings
  - Semantic VAD configuration
  - Interruption handling

- [Scope Agent Enhancements](./SCOPE_AGENT_ENHANCEMENTS.md)
  - Voice scope agent
  - Claim context integration
  - Tool definitions

### Sketch & Estimate

- [Sketch Contract](./SKETCH_CONTRACT.md)
  - Sketch data structure
  - Room geometry
  - Opening definitions

- [Sketch UI](./SKETCH_UI.md)
  - UI components
  - Floor plan rendering
  - Interaction patterns

- [Estimate Engine](./ESTIMATE_ENGINE.md)
  - Estimate calculations
  - Pricing engine
  - Depreciation calculations

- [Scope Engine](./SCOPE_ENGINE.md)
  - Scope evaluation
  - Quantity calculations
  - Line item matching

- [Export ESX](./EXPORT_ESX.md)
  - ESX export format
  - Xactimate compatibility
  - Export process

### Workflows

- [Dynamic Workflow Engine](./DYNAMIC_WORKFLOW_ENGINE.md)
  - Workflow generation
  - Step creation
  - Dynamic expansion

- [Workflow Scan Report](./WORKFLOW_SCAN_REPORT.md)
  - Workflow analysis
  - Step validation
  - Evidence requirements

### Architecture

- [Architecture Details](../ARCHITECTURE.md)
  - System architecture
  - Component structure
  - Data flow

- [Sketch ESX Architecture](./sketch-esx-architecture.md)
  - Sketch to ESX conversion
  - Data mapping
  - Export pipeline

---

## 📊 Status & Reports

### [Implementation Status](./IMPLEMENTATION_STATUS.md)
Current implementation status of features.

### [Codebase Review](./CODEBASE_REVIEW.md)
Codebase review and analysis.

### [Mobile Optimization Report](../MOBILE_OPTIMIZATION_REPORT.md)
Mobile optimization details:
- Responsive design
- Touch targets
- Safe areas
- iOS optimizations

### [All Issues Complete](../ALL_ISSUES_COMPLETE.md)
Summary of all fixes and improvements.

---

## 🚀 Getting Started

1. **New to the project?**
   - Start with [README.md](../README.md)
   - Read [Developer Guide](./DEVELOPER_GUIDE.md)
   - Check [Quick Reference](./QUICK_REFERENCE.md)

2. **Working on a feature?**
   - See [Complete Feature Documentation](./COMPLETE_FEATURE_DOCUMENTATION.md)
   - Check feature-specific docs
   - Review [API Documentation](./API_DOCUMENTATION.md)

3. **Working on database?**
   - See [Database Schema](./DATABASE_SCHEMA.md)
   - Check `shared/schema.ts`

4. **Debugging?**
   - See [Developer Guide - Debugging](./DEVELOPER_GUIDE.md#debugging)
   - Check [Quick Reference - Common Issues](./QUICK_REFERENCE.md#common-issues)

---

## 📝 Documentation Standards

When adding new documentation:

1. **Use Markdown**: All docs in Markdown format
2. **Include Examples**: Code examples for clarity
3. **Keep Updated**: Update docs when code changes
4. **Link Related**: Link to related documentation
5. **Be Clear**: Use simple, clear language

---

## 🔍 Finding Information

### By Topic

- **Voice Features**: See Voice-specific docs
- **Estimate Building**: See Estimate Engine, Scope Engine
- **Workflows**: See Dynamic Workflow Engine
- **API**: See API Documentation
- **Database**: See Database Schema
- **Development**: See Developer Guide

### By File Type

- **Frontend**: `client/src/` - See Developer Guide
- **Backend**: `server/` - See Developer Guide
- **Database**: `shared/schema.ts` - See Database Schema
- **API Routes**: `server/routes.ts` - See API Documentation

---

## 📞 Support

For questions or issues:
1. Check relevant documentation
2. Search existing issues
3. Ask in team chat
4. Create new issue if needed

---

**Last Updated**: See git history for latest updates.
