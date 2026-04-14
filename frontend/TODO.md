# SPMT Dashboard UI Redesign - Progress Tracker

**Status:** In Progress  
**Plan Approved:** Yes

## Steps (Following Approved Plan)

### 1. TopBar.jsx Updates

- [ ] Replace branding with single logo.png only
- [ ] Simplify metrics to 4 boxes (ONLINE, OFFLINE, CRITICAL, UNKNOWN) in 1 row
- [ ] Responsive flex for mini/full screen

### 2. StatusPanel.jsx Updates

- [ ] Replace detailed list/graph with single row 4 large status boxes
- [ ] Full-width responsive (2x2 mobile)

### 3. CSS Updates (index.css)

- [ ] Add .page-image-container for full-page images
- [ ] @keyframes slideUp for hover name animation
- [ ] Media queries: mobile stacking, fullscreen padding

### 4. Page Replacements

- [ ] DashboardPage.jsx → Dashboard image + "Dashboard" hover
- [ ] WebsitesPage.jsx → Websites image + "Websites" hover
- [ ] ActivityLogPage.jsx → Activity image + "Activity" hover
- [ ] UsersPage.jsx → Users image + "Users" hover

### 5. Testing

- [ ] Responsive mobile/desktop
- [ ] Hover animations smooth
- [ ] `npm run dev` + browser test

**Next:** Step 1 - Edit TopBar.jsx
