# Laboratorio Integral de NTP y Ciberseguridad

**Universidad Nacional Arturo Jauretche (UNAJ)**  
**Materia:** Redes de Computadoras II (2026)  
**Docente:** Iriarte Leandro  
**Equipo:** Alvarez Alegre N. · Araujo J. · More A. G. · Sapienza N. A.

---

## 📌 Descripción del Proyecto

Aplicación web interactiva desarrollada para la defensa monográfica sobre **Network Time Protocol (NTP)** y su impacto en la infraestructura de red, seguridad informática y peritaje judicial.

El sistema está empaquetado como un **único archivo HTML autónomo** (`dist/index.html`) que incluye estilos Tailwind CSS, íconos vectoriales, fuentes tipográficas (IBM Plex Sans y Mono), motor de simulación determinista a 60 FPS y una ventana de presentador sincronizada localmente mediante `BroadcastChannel`.

---

## 🚀 Puesta en Marcha y Verificación

### 1. Requisitos Previos
- Node.js v18+ y npm instalados.

### 2. Instalación de Dependencias
```bash
npm install
```

### 3. Ejecución de la Suite de Pruebas Automatizadas (Vitest)
Verifica que las ecuaciones del RFC 5905, el sesgo asimétrico de 80 ms, la inversión causal del SIEM, los cinco vectores de Time Spoofing con NTS y el factor BAF 556,9:1 de monlist pasen al 100%:
```bash
npm test
```

### 4. Modo Desarrollo
Inicia el servidor local de desarrollo con hot-reload:
```bash
npm run dev
```
Acceder en el navegador a: `http://localhost:5173`.

### 5. Compilación del Entregable Único (`dist/index.html`)
Empaqueta todo el proyecto en un único archivo HTML listo para proyector (Requisito G10), operable sin conexión a internet ni servidor web:
```bash
npm run build
```
El archivo resultante se ubica en `dist/index.html` (~1.5 MB).

---

## 🗺️ Mapa de Escenas

| Escena | Tecla | Rango Temporal | Descripción Clave |
| :--- | :---: | :---: | :--- |
| **0. Portada** | `0` | 0:00 – 1:00 | Pregunta disparadora, tres pilares (Precisión, Evidencia y Seguridad) y nómina de autores. |
| **1. Sincronización** | `1` | 1:00 – 4:00 | Algoritmo RFC 5905 ($T_1 \dots T_4$, $\theta$, $\delta$), error irreducible por ruta asimétrica, escalera de estratos (0–16) y comparación Step vs Slew. |
| **2. Peritaje Forense** | `2` | 4:00 – 7:30 | Plano CAD interactivo, impacto de clock drift en correlación SIEM, detección de inversión causal y salida `chronyc tracking` / `ntpq -p`. |
| **3. Time Spoofing y NTS** | `3` | 7:30 – 11:00 | Ataque MitM sobre UDP 123, 5 vectores temporales, impacto en TOTP/Kerberos/ARCA/TLS/DNSSEC y protección RFC 8915 (NTS-KE + AEAD). |
| **4. Amplificación DDoS** | `4` | 11:00 – 14:00 | Comando Modo 7 `monlist` en Canvas a 60 FPS, factores BAF (205:1 y 556,9:1 US-CERT) y mitigación con directivas `ntp.conf` (Factor 0:1). |

---

## ⌨️ Atajos Globales de Teclado

- `0` a `4`: Navegación directa entre Portada y Escenas 1 a 4.
- `F`: Alternar **Modo Exposición** (Pantalla completa y ocultamiento automático del cursor tras 3 s).
- `Espacio`: Pausar / Reanudar la simulación activa (`sim.t`).
- `Flecha Derecha` / `Flecha Izquierda`: Paso a paso (adelante / atrás).
- `R`: Reiniciar la escena activa a su estado inicial.

---

## 🎙️ Ventana de Presentador (Guion y Cronómetro)

Se abre desde el botón **"Guion (G14)"** en la cabecera o navegando a `#presenter`:
- **Cronómetro maestro:** Meta de 15:00 minutos (+ 2 minutos de colchón).
- **Sincronización en vivo:** Recibe en tiempo real el paso actual, tiempo virtual y narración de la pantalla proyectada mediante `BroadcastChannel`.
- **Hoja de ruta:** Guion con acciones exactas del operador, frases puente y Plan B de contingencia.

