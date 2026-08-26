# Venus 

> A modern, collaborative 3D CAD platform built for the web


## Overview

Venus is a next-generation browser-based 3D CAD platform that revolutionizes collaborative design. Built on TypeScript and WebAssembly, Venus combines the power of OpenCascade with modern web technologies to deliver professional-grade CAD tools, real-time collaboration, AI-powered assistance, and cloud-based project management—all accessible through your browser.

LIVE Link: https://venuscad.pages.dev/

### Screenshot
<img width="1917" height="1008" alt="image" src="https://github.com/user-attachments/assets/1ceabf08-3a12-4b0f-b05f-2bb0ecbaff96" />




### Key Features

- ** AI CAD Copilot**: AI Copilot for CAD desing based on user prompt or sketch
- ** Real-time Collaboration**: Work simultaneously with team members on 3D models
- ** Cloud Storage**: Automatic project sync via Cloudinary with version control
- ** GitHub-Style History**: Track every change with detailed commit-style version history
- ** Team Management**: Create teams, manage members, and organize projects
- ** Complete CAD Toolset**: Professional modeling, editing, and analysis tools
- ** Import/Export**: Support for industry-standard formats (STEP, IGES, BREP)
- ** Parametric Variations**: Create design variations with parametric modeling
- ** WebAssembly Performance**: Near-native speed using OpenCascade compiled to WASM
- ** Modern UI**: Clean, professional interface with glassmorphic design

## Technology Stack

### Frontend
- **TypeScript** - Type-safe development
- **Three.js** - 3D rendering and visualization
- **Rspack** - Fast build tooling
- **Biome** - Unified linting and formatting

### Backend & Services
- **Firebase** - Authentication and Firestore database
- **Cloudinary** - Cloud storage for 3D models
- **WebAssembly** - OpenCascade OCCT for CAD operations

### Architecture
- **Monorepo Structure** - 12 modular packages
- **Package-based Organization** - Clean separation of concerns
- **Modern Web Standards** - ES modules, Web Workers, WebGL

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Git

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/Ruthwik000/venus_fe.git
   cd venus_fe
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Set up environment variables
   ```bash
   cp .env.example .env
   # Edit .env with your Firebase and Cloudinary credentials
   ```

### Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:8080`

### Building

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

### Code Quality

Run linting and auto-fix:

```bash
npm run check
```

Format all code:

```bash
npm run format
```

### Testing

Run all tests:

```bash
npm run test
```

Run tests with coverage:

```bash
npm run testc
```

## Project Structure

```
venus_fe/
├── packages/
│   ├── chili-core/          # Core interfaces and utilities
│   ├── chili-web/           # Web application entry point
│   ├── chili-ui/            # UI components
│   ├── chili-three/         # Three.js integration
│   ├── chili-builder/       # Application builder
│   ├── chili-controls/      # User controls
│   ├── chili-storage/       # Data persistence
│   ├── chili-i18n/          # Internationalization
│   └── chili-wasm/          # WebAssembly bindings
├── cpp/                     # C++ source for WASM
├── public/                  # Static assets
└── scripts/                 # Build and utility scripts
```

## Features

### 🤖 AI CAD Copilot

- **Intelligent Design Assistance**: AI-powered suggestions for optimal design patterns
- **Automated Modeling**: Generate 3D models from natural language descriptions
- **Design Optimization**: AI-driven recommendations for structural improvements
- **Smart Constraints**: Automatic constraint detection and application
- **Pattern Recognition**: Identify and replicate design patterns across models

### 🛠️ Complete CAD Toolset

#### Basic Shapes & Primitives
- Box, Cylinder, Cone, Sphere, Pyramid, Prism
- Torus, Wedge, and custom primitives
- Parametric shape generation

#### 2D Sketching Tools
- Lines, Arcs, Circles, Ellipses
- Rectangles, Polygons, Splines
- Bezier curves and NURBS
- Constraint-based sketching

#### Advanced Modeling Operations
- **Boolean Operations**: Union, Difference, Intersection, XOR
- **Extrusion**: Linear and tapered extrusion with draft angles
- **Revolution**: Revolve profiles around axes
- **Sweeping**: Sweep profiles along paths
- **Lofting**: Create surfaces between multiple profiles
- **Offset**: Offset surfaces and curves
- **Thickening**: Add thickness to surfaces
- **Shelling**: Hollow out solid bodies

#### Editing & Modification Tools
- **Chamfer & Fillet**: Edge blending with variable radius
- **Trim & Extend**: Modify curve and surface boundaries
- **Split & Break**: Divide objects at specified locations
- **Mirror**: Create symmetric copies
- **Pattern**: Linear, circular, and custom patterns
- **Scale & Transform**: Precise transformations with constraints
- **Feature Removal**: Remove holes, fillets, and other features

#### Analysis & Measurement
- **Distance Measurement**: Point-to-point, point-to-edge, edge-to-edge
- **Angle Measurement**: Between edges, faces, and planes
- **Area Calculation**: Surface area of faces and bodies
- **Volume Calculation**: Mass properties and volume analysis
- **Center of Mass**: Calculate geometric and mass centers
- **Bounding Box**: Get dimensional extents
- **Curvature Analysis**: Analyze surface curvature

### 👥 Real-time Collaboration

- **Live Presence Indicators**: See who's viewing or editing in real-time
- **Cursor Tracking**: Watch collaborators' actions as they happen
- **Comments & Annotations**: Add contextual comments to specific features
- **Team Chat**: Built-in messaging for project discussions
- **Activity Feed**: Track all project changes and collaborator actions
- **Conflict Resolution**: Automatic handling of concurrent edits
- **Permission Management**: View, comment, or edit access levels

### 🏢 Team Management

- **Create Teams**: Organize users into collaborative workspaces
- **Role-Based Access**: Owner, Admin, Member, and Viewer roles
- **Project Organization**: Group projects by team
- **Member Invitations**: Invite via email with automatic notifications
- **Team Dashboard**: Overview of team projects and activity
- **Resource Sharing**: Share libraries and templates across teams
- **Team Analytics**: Track team productivity and project metrics

### 📊 Project Management

- **Dashboard Overview**: Visual summary of all projects and teams
- **Version History**: GitHub-style commit history for every save
  - Track who made changes and when
  - View detailed change descriptions
  - Download any previous version
  - Compare versions side-by-side
- **Storage Analytics**: Monitor storage usage across all projects
- **Project Starring**: Quick access to favorite projects
- **Search & Filter**: Find projects by name, date, or collaborators
- **Project Templates**: Create and reuse project templates
- **Bulk Operations**: Manage multiple projects simultaneously

### 🎭 Parametric Modeling

- **Parametric Constraints**: Define relationships between features
- **Design Variables**: Create adjustable parameters
- **Equations & Formulas**: Drive dimensions with mathematical expressions
- **Design Tables**: Generate variations from parameter sets
- **Configuration Management**: Save and switch between design variants
- **Update Propagation**: Automatic model updates when parameters change
- **History-Based Modeling**: Edit feature history to modify designs

### 📁 Import & Export

#### Supported Import Formats
- **STEP** (.step, .stp) - Industry standard for CAD data exchange
- **IGES** (.iges, .igs) - Legacy CAD format support
- **BREP** (.brep) - OpenCascade native format
- **STL** (.stl) - For 3D printing and mesh operations
- **OBJ** (.obj) - Mesh geometry with materials

#### Supported Export Formats
- **STEP** (.step, .stp) - For CAD software interoperability
- **IGES** (.iges, .igs) - Legacy system compatibility
- **BREP** (.brep) - Native format with full fidelity
- **STL** (.stl) - For 3D printing and manufacturing
- **OBJ** (.obj) - For rendering and visualization
- **JSON** (.json) - Venus native format with metadata

#### Import/Export Features
- **Batch Processing**: Import/export multiple files
- **Format Conversion**: Convert between supported formats
- **Validation**: Automatic geometry validation on import
- **Repair Tools**: Fix common geometry issues
- **Metadata Preservation**: Maintain design intent and annotations
- **Assembly Support**: Import/export multi-part assemblies

### 🎨 User Interface

- **Modern Landing Page**: Animated WebGL shader background
- **Responsive Design**: Optimized for desktop and tablet
- **Dark Theme**: Professional UI optimized for extended use
- **Customizable Workspace**: Arrange panels and toolbars
- **Keyboard Shortcuts**: Efficient workflow with hotkeys
- **Context Menus**: Right-click access to relevant tools
- **Command Palette**: Quick access to all functions
- **Undo/Redo**: Unlimited history with transaction tracking
- **Multi-viewport**: Work with multiple views simultaneously

### ☁️ Cloud Features

- **Automatic Sync**: Changes saved to cloud in real-time
- **Offline Mode**: Continue working without internet
- **Cross-device Access**: Access projects from any device
- **Backup & Recovery**: Automatic backups with point-in-time recovery
- **CDN Delivery**: Fast loading via global content delivery network
- **Secure Storage**: Encrypted storage with Cloudinary
- **Storage Quotas**: Track and manage storage limits

## WebAssembly Build

To build the WebAssembly module from C++ source:

1. Set up WASM dependencies (first time only):
   ```bash
   npm run setup:wasm
   ```

2. Build the WASM module:
   ```bash
   npm run build:wasm
   ```

## Contributing

We welcome contributions! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run `npm run check` before committing
4. Commit with conventional commit messages
5. Push to your branch
6. Open a Pull Request

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Example: `feat(ui): add project history dialog`

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

For commercial licensing options, please contact the maintainers.

See [LICENSE](LICENSE) for full details.

## Acknowledgments

Built on top of [Chili3D](https://github.com/xiangechen/chili3d) - An open-source 3D CAD framework

Special thanks to:
- OpenCascade for the CAD kernel
- Three.js community for 3D rendering
- Firebase for backend services
- Cloudinary for cloud storage

## Support

- **Issues**: [GitHub Issues](https://github.com/Ruthwik000/venus_fe/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Ruthwik000/venus_fe/discussions)

## Disclaimer

This software is provided "AS IS" without warranty of any kind. Users assume all risks associated with its use. The authors and contributors disclaim all liability for any damages, data loss, or consequences arising from the use of this software.

---

Made with ❤️ by the ProteinX team
