# Contributing to nw_wrld

Thank you for your interest in contributing! This project welcomes contributions from everyone, whether you're fixing a typo, adding a feature, or creating new visual modules.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [How Can I Contribute?](#how-can-i-contribute)
3. [Development Setup](#development-setup)
4. [Coding Standards](#coding-standards)
5. [Submitting Changes](#submitting-changes)
6. [Module Contributions](#module-contributions)
7. [Documentation Contributions](#documentation-contributions)
8. [Bug Reports](#bug-reports)
9. [Feature Requests](#feature-requests)
10. [Testing Guidelines](#testing-guidelines)
11. [Architecture Guidelines](#architecture-guidelines)
12. [Getting Help](#getting-help)

---

## Code of Conduct

This project follows a simple code of conduct:

- Be respectful and inclusive
- Be constructive in feedback
- Help newcomers learn
- Focus on what's best for the community

Unacceptable behavior will not be tolerated.

---

## How Can I Contribute?

### 1. Report Bugs

Found a bug? Open an issue with:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Your environment (OS, Node version, etc.)
- Screenshots if applicable

### 2. Suggest Features

Have an idea? Open an issue with:

- Clear description of the feature
- Why it would be useful
- How it might work
- Example use cases

### 3. Improve Documentation

Documentation improvements are always welcome:

- Fix typos or unclear explanations
- Add examples
- Improve tutorials
- Translate to other languages

### 4. Submit Code

- Fix bugs
- Add features
- Create new modules
- Optimize performance
- Improve UI/UX

---

## Development Setup

### Prerequisites

- Node.js v18 or higher
- Git
- A code editor (VS Code recommended)
- Basic familiarity with JavaScript

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/nw_wrld.git
cd nw_wrld
```

3. Add the upstream repository:

```bash
git remote add upstream https://github.com/aagentah/nw_wrld.git
```

### Install Dependencies

```bash
npm install
```

### Run the App

```bash
npm start
```

Two windows should open: Dashboard and Projector.

### Development Workflow

1. Create a branch for your changes:

```bash
git checkout -b feature/my-awesome-feature
```

2. Make your changes
3. Test thoroughly
4. Commit with clear messages
5. Push to your fork
6. Open a pull request

---

## Coding Standards

### JavaScript Style

- Use ES6+ features (arrow functions, destructuring, etc.)
- Use `const` and `let`, never `var`
- Use meaningful variable names
- Keep functions small and focused
- Prefer functional patterns over imperative

### Formatting

- 2 spaces for indentation
- Semicolons are optional but be consistent
- Use single quotes for strings
- No trailing whitespace

### Comments

- Add comments for complex logic
- Use JSDoc for functions and methods
- Explain "why" not "what"
- Keep comments up to date

Example:

```javascript
/**
 * Pulses the module by animating scale.
 * @param {Object} options
 * @param {number} options.intensity - Scale multiplier (default: 1.5)
 * @param {number} options.duration - Animation duration in ms
 */
pulse({ intensity = 1.5, duration = 500 }) {
  // Animation logic here
}
```

### Module Structure

All modules must:

1. Extend `ModuleBase` or `BaseThreeJsModule`
2. Include the required `@nwWrld` docblock metadata (`name`, `category`, `imports`)
3. Default-export the module class
4. Call `super()` first in constructor
5. Implement `destroy()` and call `super.destroy()` last

Example:

```javascript
/*
@nwWrld name: MyModule
@nwWrld category: Examples
@nwWrld imports: ModuleBase
*/

class MyModule extends ModuleBase {
  constructor(container) {
    super(container);
    this.init();
  }

  init() {
    // Setup code
  }

  destroy() {
    // Cleanup code
    super.destroy();
  }
}

export default MyModule;
```

---

## Submitting Changes

### Before You Submit

- [ ] Test your changes thoroughly
- [ ] Run the app and verify no console errors
- [ ] Test on your target platform (Mac/Windows)
- [ ] Update documentation if needed
- [ ] Add yourself to contributors if it's your first PR

### Commit Messages

Use clear, descriptive commit messages:

```
Good:
- "Add pulsing circle module with color customization"
- "Fix MIDI channel mapping bug in Dashboard"
- "Update README with Windows setup instructions"

Bad:
- "Update"
- "Fix stuff"
- "Changes"
```

### Pull Request Process

1. **Title**: Clear and descriptive

   - Good: "Add support for custom MIDI port selection"
   - Bad: "Update code"

2. **Description**: Include:

   - What changed and why
   - How to test it
   - Screenshots/GIFs for UI changes
   - Related issue numbers (`Fixes #123`)

3. **Keep it focused**: One feature/fix per PR

4. **Be responsive**: Address review feedback promptly

5. **Update your branch** if main has changed:

```bash
git fetch upstream
git rebase upstream/main
```

### Review Process

- Maintainers will review your PR
- They may request changes
- Be patient—reviews take time
- Address feedback constructively

---

## Module Contributions

### Creating a New Module

1. Read the [Module Development Guide](MODULE_DEVELOPMENT.md)
2. Create your module in your project folder under `modules/YourModule.js`
3. Follow the module structure standards
4. Test with multiple instances
5. Create documentation (see below)

### Module Documentation

If you’re contributing documentation for a module, add a markdown file alongside the docs in this repo (or link to a project folder example in the PR).

Include:

```markdown
# Your Module Name

Brief description of what it does.

## Preview

![Screenshot](../screenshots/your-module.png)

## What It Does

Detailed explanation.

## Methods

### methodName

Description and parameters.

## Example Usage

Step-by-step guide to use it.

## Tips

Any tips or tricks.

## Learning Points

What developers can learn from this module.
```

### Module Assets

If your module needs assets, there are two cases:

- **Starter assets shipped with nw_wrld** (seeded into new projects): add them under `src/assets/` (e.g. `src/assets/images/`, `src/assets/json/`)
- **Assets for a specific user project**: they live in that project folder under `assets/` (e.g. `MyProject/assets/images/`)

### Module Categories

Use appropriate categories:

- `Text` - Text-based visuals
- `GUI` - UI elements and overlays
- `3D` - Three.js 3D graphics
- `2D` - Canvas-based 2D graphics
- `Data` - Data visualization
- `Effects` - Visual effects and filters
- `Particle` - Particle systems
- `Examples` - Tutorial/example modules

---

## Documentation Contributions

### Types of Documentation

1. **README.md** - Main project documentation
2. **GETTING_STARTED.md** - Beginner tutorial
3. **MODULE_DEVELOPMENT.md** - Module creation guide
4. **Examples** - Module examples and tutorials

### Documentation Guidelines

- Write for beginners (assume minimal coding knowledge)
- Use clear, simple language
- Include code examples
- Add screenshots/diagrams where helpful
- Test all instructions
- Keep it up to date

### Adding Examples

Examples should be:

- Self-contained and working
- Well-commented
- Progressive (simple → complex)
- Practical and useful

---

## Bug Reports

A good bug report includes:

### 1. Environment

```
- OS: macOS 13.2 / Windows 11
- Node version: 20.x.x
- App version: 1.0.0
```

### 2. Steps to Reproduce

```
1. Open Dashboard
2. Create new track
3. Add Text module
4. Click on...
```

### 3. Expected Behavior

"The text should change color"

### 4. Actual Behavior

"The app crashes with error..."

### 5. Console Output

Include error messages from the Developer Console.

### 6. Screenshots/Video

Visual evidence is helpful.

---

## Feature Requests

A good feature request includes:

### 1. Problem Statement

"As a VJ, I need to quickly switch between color palettes during a performance."

### 2. Proposed Solution

"Add a 'Color Palette' module that stores 5 colors and can cycle through them."

### 3. Alternatives Considered

"I could use multiple color pickers, but that's cumbersome."

### 4. Additional Context

"This would be useful for live shows where you need fast color changes."

---

## Testing Guidelines

### Manual Testing

Before submitting:

1. **Fresh Install Test**: Clone your branch fresh and run it
2. **MIDI Test**: Verify MIDI routing works
3. **Module Test**: Test your module with different parameters
4. **Multi-Instance Test**: Add multiple instances of your module
5. **Performance Test**: Check CPU/memory usage
6. **Cleanup Test**: Switch tracks and verify cleanup

### Console Checks

Open Developer Tools and check for:

- No errors in Console
- No warnings about memory leaks
- No 404s for missing assets

---

## Architecture Guidelines

### Respect Existing Patterns

- Dashboard handles UI and MIDI input
- Projector handles visual output
- IPC for communication between windows
- Jotai for state management in Dashboard
- ModuleBase for module inheritance

### Don't Break Existing Functionality

- Test that existing modules still work
- Don't change base class APIs without discussion
- Maintain backward compatibility where possible

### Keep It Simple

- Don't over-engineer
- Avoid unnecessary abstractions
- Prefer clarity over cleverness
- Keep dependencies minimal

---

## Getting Help

### Questions?

- Open a discussion on GitHub
- Check existing issues
- Read the documentation

### Need Guidance?

- Ask in discussions before starting large changes
- Propose your approach before implementing
- Request early feedback with draft PRs

---

## Recognition

Contributors are recognized in:

- README.md contributors section
- Release notes for significant contributions
- GitHub contributors page

---

## License

By contributing, you agree that your contributions will be licensed under the GPL-3.0 License.

---

## Thank You!

Your contributions make this project better for everyone. Whether you're fixing a typo or building a complex feature, we appreciate your time and effort.

**Happy contributing! 🎨🎵**
