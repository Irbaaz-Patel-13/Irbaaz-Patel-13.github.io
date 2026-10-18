# irbaaz-patel-13.github.io

Portfolio site for Irbaaz Ahmed Patel, robotics engineer (perception and manipulation).

Plain static HTML, CSS and JavaScript. No build step.

- `index.html` – home page
- `work/` – case studies (Toyota HSR grasping, pick-and-place RL, humanoid locomotion, beach litter detection)
- `assets/hsr/` – data for the 3D replay of the 7 Aug 2026 HSR run: point cloud and joint values from [intent-grasp-hsr](https://github.com/Irbaaz-Patel-13/intent-grasp-hsr)

Third-party files, used unmodified:
- HSR URDF from Toyota's `hsr_description` (BSD 3-Clause Clear) and meshes from `hsr_meshes` (CC BY-NC-ND 4.0, see `assets/hsr/meshes/LICENSE.txt`)
- three.js r170 (MIT) and urdf-loader 0.12.7 (Apache-2.0) in `assets/vendor/`
