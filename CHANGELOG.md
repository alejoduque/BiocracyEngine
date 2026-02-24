# Changelog: Biocracy Engine (SiC)

## [Unreleased]
### Added
- **Arquitectura Biocracy Engine**: Consolidado el proyecto bajo el nombre conceptual de Sistema Interconectado Común (SiC), rechazando metáforas antropocéntricas de la tabla periódica.
- **Scraper de Ethereum (`eth_sonify.py`)**: Script refactorizado para escuchar la Mainnet utilizando Infura y transformar data financiera a oscilometría musical. Funciona de manera autónoma sin bloqueo del GUI.
- **Sistema de Control Headless OSC**: SuperCollider (`sonETH/0_loader.scd`) ahora es cargado en *background* (Headless). Los parámetros locales de `4_gui.scd` fueron reemplazados por endpoints dinámicos OSC (`4_osc_control.scd`).
- **Web-Gui Unificada (`nw_wrld`)**: Integrado un fork local de `nw_wrld` que excluye paquetes masivos del versionamiento. Se migró `BiocracyVisualizer.js` para recibir valores lógicos y renderizar la actividad fúngica/forestal, emitiendo sliders automáticos en la web que mutan parámetros clave de `sclang`.
- **Orquestador Central Bash**: Creación y estabilización de `./start_ecosystem.sh` para matar, verificar entorno virtual Python, levantar servidor Web y lanzar el backend SuperCollider bajo un mismo *thread* bash con limpieza unificada vía `Ctrl+C`.

### Removed
- **Arquitectura GUI monolítica**: Depreciada la versión previa interactiva de ventanas locales en SuperCollider (`4_gui.scd`), unificándolo a favor del Web-Dashboard mediante `BiocracyVisualizer`.

### Changed
- El README del repositorio completo ha sido actualizado narrativamente para abrazar la identidad del Biocracy Engine.
