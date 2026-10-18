# irbaaz-patel-13.github.io

Portfolio site for Irbaaz Ahmed Patel, robotics engineer (perception and manipulation).

Plain static HTML, CSS and JavaScript. No build step.

- `index.html` – the whole site, one scrolling page
- `assets/js/scene.js` – the hero: the HSR's URDF and the real point cloud from the 7 Aug 2026 run, played by scrolling
- `assets/js/main.js` – smooth scroll and scroll-driven animation (Lenis, GSAP ScrollTrigger)
- `assets/hsr/` – point cloud and logged joint values from [intent-grasp-hsr](https://github.com/Irbaaz-Patel-13/intent-grasp-hsr)

Third-party files, used unmodified:
- HSR URDF from Toyota's `hsr_description` (BSD 3-Clause Clear) and meshes from `hsr_meshes` (CC BY-NC-ND 4.0, see `assets/hsr/meshes/LICENSE.txt`)
- three.js r170 (MIT), urdf-loader 0.12.7 (Apache-2.0), GSAP 3.14 (GSAP standard licence) and Lenis 1.3 (MIT) in `assets/vendor/`
