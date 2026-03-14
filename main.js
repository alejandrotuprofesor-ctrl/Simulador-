// main.js - Standard Script Version
let scene, camera, renderer, controls;
let currentQuestionIndex = 0;
let userChoices = [];
let questionHistory = [];
let ui = {};
let isMobileDevice = false;

// Variables de Simulación Globales (Inicialización segura para evitar NaN)
let isWelding = false;
let isWeldButtonPressed = false;
let keysPressed = {};
let toolOffset = { x: 0, y: 0, z: 0 };
let targetToolOffset = { x: 0, y: 0, z: 0 };
let toolRotation = { x: 0, z: 0 };
let targetToolRotation = { x: 0, z: 0 };
let plateThickness = 0.1;
let consumptionRate = 0.05;
let electrodeInitialHeight = 3.5;
let electrodeCurrentHeight = 3.5;
let moveSpeed = 0.5;
let rotationSpeed = 1.0;
let lastBeadPos = new THREE.Vector3(100, 100, 100);
let idealWeldX = -1.25; // Punto de inicio de la soldadura (longitudinal)
let weldSpeedMultiplier = 0;
let stepIntroTime = 0; // Para animación automática en los pasos de ajuste
let smoothDemoInput = 0; // Valor suavizado para la UI de los mandos en las demos
let isWaitingForCam = false; 
const BASE_WELD_SPEED = 0.04; // Velocidad real aproximada (unidades/segundo)

let arcLight, arcGlare, sparkParticles;
let beadContainer;
let angleIndicator, angleLabel, distanceIndicator, genialLabel;

// Cámara gliding
let isCameraTransitioning = false;

// --- SISTEMA DE AUDIO UI ---
let audioCtx;
function playClickSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const now = audioCtx.currentTime;
        
        // --- Capa 1: Pulso Mecánico (El "Click") ---
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'square'; // Onda cuadrada para ese toque "retro/robot"
        osc1.frequency.setValueAtTime(150, now);
        osc1.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        
        gain1.gain.setValueAtTime(0.05, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        
        // --- Capa 2: Servo/Digital (El "Robótico") ---
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(800, now);
        osc2.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
        
        gain2.gain.setValueAtTime(0.03, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        
        osc1.start(now);
        osc1.stop(now + 0.1);
        osc2.start(now);
        osc2.stop(now + 0.05);
        
    } catch(e) { console.warn("Audio Context error:", e); }
}

// Esperar a que el DOM esté listo
window.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed");
    
    // Detectar dispositivo
    isMobileDevice = checkIfMobile();
    if(isMobileDevice) document.body.classList.add('is-mobile');
    
    initUI();
    init();
    animate();

    // Listener global para sonidos de UI
    document.addEventListener('mousedown', (e) => {
        const target = e.target;
        if (target.tagName === 'BUTTON' || target.closest('button') || target.closest('.option-card')) {
            playClickSound();
        }
    });
});

function checkIfMobile() {
    return (window.matchMedia("(pointer: coarse)").matches) || 
           (navigator.maxTouchPoints > 0) ||
           (window.innerWidth <= 768);
}

function initUI() {
    ui = {
        welcomeScreen: document.getElementById('welcome-screen'),
        questionScreen: document.getElementById('question-screen'),
        resultScreen: document.getElementById('result-screen'),
        btnStart: document.getElementById('btn-start'),
        btnBack: document.getElementById('btn-back'),
        btnRestart: document.getElementById('btn-restart'),
        btnResultsBack: document.getElementById('btn-results-back'),
        optionsGallery: document.getElementById('options-gallery'),
        questionTitle: document.getElementById('question-title'),
        progressBar: document.getElementById('progress-bar'),
        stepCount: document.getElementById('step-count'),
        visualSummary: document.getElementById('visual-summary'),
        // Sim HUD
        simHud: document.getElementById('sim-hud'),
        instrTitle: document.getElementById('instr-title'),
        instrDesc: document.getElementById('instr-desc'),
        btnNextStep: document.getElementById('btn-next-step'),
        btnStartWeld: document.getElementById('btn-start-weld'),
        // Mobile containers
        mobileControls: document.getElementById('mobile-controls'),
        joystickKnob: document.getElementById('joystick-knob'),
        universalJoystick: document.getElementById('universal-joystick'),
        weldingSliders: document.getElementById('welding-sliders'),
        sliderLong: document.getElementById('slider-longitudinal'),
        sliderVert: document.getElementById('slider-vertical')
    };

    // Initialize Proportional Joystick
    if (ui.universalJoystick) initJoystick();



    if (ui.btnStart) {
        ui.btnStart.addEventListener('click', (e) => {
            ui.btnStart.classList.remove('cta-animate');
            console.log("Start button clicked (addEventListener)!");
            startApp();
        }, true);
        
        // Mobile fallback
        ui.btnStart.addEventListener('touchstart', (e) => {
            console.log("Start button touched!");
            // Only start if not already started by click
            // startApp();
        }, { passive: true });
    } else {
        console.error("Critical Error: btn-start not found!");
    }

    if (ui.btnBack) ui.btnBack.addEventListener('click', goBack);
    if (ui.btnRestart) ui.btnRestart.addEventListener('click', () => location.reload());
    if (ui.btnResultsBack) ui.btnResultsBack.addEventListener('click', prevSimStep);

    if (ui.btnNextStep) ui.btnNextStep.addEventListener('click', nextSimStep);
    
    if (ui.btnStartWeld) {
        ui.btnStartWeld.addEventListener('mousedown', () => isWeldButtonPressed = true);
        ui.btnStartWeld.addEventListener('mouseup', () => isWeldButtonPressed = false);
        ui.btnStartWeld.addEventListener('touchstart', () => isWeldButtonPressed = true, {passive: false});
        ui.btnStartWeld.addEventListener('touchend', () => isWeldButtonPressed = false);
    }

    if (ui.btnNextStep) {
        ui.btnNextStep.addEventListener('click', () => {
            ui.btnNextStep.classList.remove('cta-animate');
        });
    }

    if (ui.sliderLong) {
        ui.sliderLong.addEventListener('input', (e) => {
            ui.sliderLong.classList.remove('cta-animate-slide');
            if (currentSimState === SIM_STATES.WELDING) {
                // Durante la soldadura, controla la velocidad (0 a 4x)
                // El slider está mapeado de 0 a 1 en el HTML durante el paso WELDING
                weldSpeedMultiplier = parseFloat(e.target.value) * 4;
            } else {
                targetToolOffset.x = parseFloat(e.target.value);
            }
        });
    }

    if (ui.sliderVert) {
        ui.sliderVert.addEventListener('input', (e) => {
            ui.sliderVert.classList.remove('cta-animate-slide');
            // Geared down 10x: 10 units on slider = 1 units in simulation
            targetToolOffset.y = parseFloat(e.target.value) / 10;
        });
    }
}

function nextSimStep() {
    if (currentSimState === SIM_STATES.START) setSimState(SIM_STATES.POSITION);
    else if (currentSimState === SIM_STATES.POSITION) setSimState(SIM_STATES.AVANCE);
    else if (currentSimState === SIM_STATES.AVANCE) setSimState(SIM_STATES.TRABAJO);
    else if (currentSimState === SIM_STATES.TRABAJO) setSimState(SIM_STATES.DISTANCE);
    else if (currentSimState === SIM_STATES.DISTANCE) setSimState(SIM_STATES.READY);
    else if (currentSimState === SIM_STATES.READY) setSimState(SIM_STATES.WELDING);
}

function prevSimStep() {
    if (currentSimState === SIM_STATES.WELDING) setSimState(SIM_STATES.READY);
    else if (currentSimState === SIM_STATES.READY) setSimState(SIM_STATES.DISTANCE);
    else if (currentSimState === SIM_STATES.DISTANCE) setSimState(SIM_STATES.TRABAJO);
    else if (currentSimState === SIM_STATES.TRABAJO) setSimState(SIM_STATES.AVANCE);
    else if (currentSimState === SIM_STATES.AVANCE) setSimState(SIM_STATES.POSITION);
    else if (currentSimState === SIM_STATES.POSITION) setSimState(SIM_STATES.START);
    else if (currentSimState === SIM_STATES.START) {
        // Al estar en START (resumen), VOLVER nos saca a las preguntas
        switchView(ui.questionScreen);
        goBack(); 
    }
}

// Variables para animación de cámara
let targetCamPos = new THREE.Vector3(5, 5, 5);
let targetLookAt = new THREE.Vector3(0, 0, 0);

function setSimState(newState) {
    currentSimState = newState;
    isCameraTransitioning = true; // Activar planeo de cámara
    console.log("Cambiando estado simulación a:", newState);

    // Sincronizar SIEMPRE los targets con el valor actual en CUALQUIER cambio de estado
    targetToolOffset.x = toolOffset.x;
    targetToolOffset.y = toolOffset.y;
    targetToolOffset.z = toolOffset.z;
    targetToolRotation.x = toolRotation.x;
    targetToolRotation.z = toolRotation.z;
    
    // Resetear visibilidad de indicadores al cambiar de pantalla
    if (angleIndicator) angleIndicator.visible = false;
    if (angleLabel) angleLabel.visible = false;
    if (genialLabel) genialLabel.visible = false;
    if (distanceIndicator) distanceIndicator.visible = false;

    const pieceContainer = scene ? scene.getObjectByName("piece-container") : null;
    const isT = pieceContainer?.userData.isTJoint;
    
    // Ocultar todos los grupos móviles por defecto
    if (ui.weldingSliders) ui.weldingSliders.style.display = 'none';

    const marker = scene ? scene.getObjectByName("start-marker") : null;
    if (marker) marker.visible = (newState === SIM_STATES.POSITION);

    switch(newState) {
        case SIM_STATES.START:
            updateHud("", isMobileDevice ? 
                "<b>Selecciona para continuar</b>" : 
                "<b>Selecciona los parámetros</b>");

            ui.btnNextStep.style.display = 'block';
            ui.btnNextStep.textContent = "UBICAR ELECTRODO";
            ui.btnNextStep.classList.add('cta-animate');
            if (ui.btnResultsBack) ui.btnResultsBack.textContent = "VER PROCESOS"; 
            ui.btnStartWeld.style.display = 'none';
            targetCamPos.set(4, 3, 4);
            targetLookAt.set(0, 0, 0);
            break;

        case SIM_STATES.POSITION:
            console.log("Entering POSITION state");
            stepIntroTime = 4.0; 
            isWaitingForCam = true; 
            updateHud("Paso 1: Ubicación", "<b>Mueve el electrodo</b> hacia el círculo verde.");
            
            if (ui.mobileControls) ui.mobileControls.style.display = 'flex';
            if (ui.joystickKnob) {
                ui.joystickKnob.classList.add('cta-animate-slide');
                ui.joystickKnob.style.transition = 'none'; 
                ui.joystickKnob.style.transform = 'translateX(0px)';
                smoothDemoInput = 0; // Resetear input de demo
            }

            ui.btnNextStep.style.display = 'none'; 
            ui.btnNextStep.textContent = "SIGUIENTE: ÁNGULO AVANCE";
            ui.btnStartWeld.style.display = 'none';
            targetCamPos.set(-0.625, 0.8, 2.5); 
            targetLookAt.set(-0.625, 0.2, 0);   
            isCameraTransitioning = true; // Activar el planeo
            break;

        case SIM_STATES.AVANCE:
            console.log("Entering AVANCE state");
            stepIntroTime = 4.0;
            updateHud("Paso 2: Ángulo de Avance", isMobileDevice ?
                "Ajusta la <b>inclinación longitudinal</b>." :
                "Usa <b>C</b> y <b>V</b> para inclinar el electrodo (80°).");
            
            if (ui.mobileControls) ui.mobileControls.style.display = 'flex';
            ui.btnNextStep.style.display = 'none';
            ui.btnStartWeld.style.display = 'none';
            targetCamPos.set(0, 1.0, 2.5); 
            targetLookAt.set(-1.25, 0.6, 0);
            isCameraTransitioning = true;
            break;

        case SIM_STATES.TRABAJO:
            console.log("Entering TRABAJO state");
            stepIntroTime = 4.0;
            updateHud("Paso 3: Ángulo de Trabajo", isMobileDevice ?
                "Ajusta la <b>inclinación lateral</b>." :
                "Usa <b>Z</b> y <b>X</b> para inclinar el electrodo.");
            
            if (ui.mobileControls) ui.mobileControls.style.display = 'flex';
            ui.btnNextStep.style.display = 'none';
            ui.btnStartWeld.style.display = 'none';
            targetCamPos.set(2.5, 1.0, 0);
            targetLookAt.set(-1.25, 0.6, 0);
            isCameraTransitioning = true;
            break;

        case SIM_STATES.DISTANCE:
            console.log("Entering DISTANCE state");
            stepIntroTime = 10.0;
            updateHud("Paso 4: Separación", isMobileDevice ?
                "Ajusta la altura a <b>3 mm</b>." :
                "Usa <b>Q</b> y <b>E</b> para ajustar la altura a <b>3 mm</b>.");
            
            if (ui.mobileControls) ui.mobileControls.style.display = 'flex';
            ui.btnNextStep.style.display = 'none';
            ui.btnStartWeld.style.display = 'none';
            targetCamPos.set(-1.1, 0.15, 0.3);
            targetLookAt.set(-1.25, 0.12, 0);
            isCameraTransitioning = true;
            break;

        case SIM_STATES.READY:
            console.log("Entering READY state");
            stepIntroTime = 10.0;
            updateHud("Paso 5: Soldadura", "Baja el electrodo lentamente hasta que toque la chapa para iniciar el arco.");
            if (ui.mobileControls) ui.mobileControls.style.display = 'none';
            ui.btnNextStep.style.display = 'none';
            ui.btnStartWeld.style.display = 'none'; 
            if (ui.weldingSliders) ui.weldingSliders.style.display = 'flex';
            targetCamPos.set(3, 2, 3);
            targetLookAt.set(0, 0.4, 0);
            isCameraTransitioning = true;
            break;
            
            // Sincronizar sliders con posición actual y animar como CTA
            if (ui.sliderLong) {
                ui.sliderLong.value = toolOffset.x.toFixed(3);
                ui.sliderLong.classList.add('cta-animate-slide');
            }
            if (ui.sliderVert) {
                ui.sliderVert.value = (toolOffset.y * 10).toFixed(3);
                ui.sliderVert.classList.add('cta-animate-slide');
            }
            
            targetCamPos.set(3, 2, 3); // Vista completa
            targetLookAt.set(0, 0.4, 0);
            
            // Si ya está tocando, pasar directamente a WELDING
            // (Se comprobará en el animate loop)
            break;

        case SIM_STATES.WELDING:
            updateHud("Paso 5: Soldadura", "Baja el electrodo hasta tocar la chapa para empezar a soldar automáticamente.");
            ui.btnNextStep.style.display = 'none';
            ui.btnStartWeld.style.display = 'none'; 
            if (ui.weldingSliders) ui.weldingSliders.style.display = 'flex';
            
            // CONFIGURAR SLIDER PARA VELOCIDAD (Throttle)
            if (ui.sliderLong) {
                ui.sliderLong.min = "0";
                ui.sliderLong.max = "1";
                ui.sliderLong.step = "0.01";
                ui.sliderLong.value = "0";
                ui.sliderLong.classList.add('cta-animate-slide'); // Re-animate for new mode
                weldSpeedMultiplier = 0;
            }
            if (ui.sliderVert) {
                ui.sliderVert.classList.add('cta-animate-slide');
            }
            
            // Reiniciar posición ideal de soldadura
            idealWeldX = -1.25; 
            const weldMarker = scene.getObjectByName("start-marker");
            if (weldMarker) {
                weldMarker.visible = true;
                weldMarker.position.x = idealWeldX;
                weldMarker.position.z = 0;
                weldMarker.material.color.setHex(0x00ff00); // Verde inicial (esperando contacto)
                weldMarker.material.opacity = 0.6;
            }
            break;
    }
    if (controls) controls.update();
    
    // Restaurar atributos del slider si salimos de WELDING
    if (newState !== SIM_STATES.WELDING && ui.sliderLong) {
        ui.sliderLong.min = "-1.25";
        ui.sliderLong.max = "1.25";
        ui.sliderLong.step = "0.001";
    }
}

function updateHud(title, desc) {
    if (ui.instrTitle) {
        ui.instrTitle.textContent = title;
        ui.instrTitle.style.display = title ? 'block' : 'none';
    }
    if (ui.instrDesc) {
        ui.instrDesc.innerHTML = desc;
        ui.instrDesc.dataset.base = desc; // Store for dynamic swapping
    }
}

// Estados de Simulación
const SIM_STATES = { START: -1, POSITION: 0, AVANCE: 1, TRABAJO: 2, DISTANCE: 3, READY: 4, WELDING: 5 };
let currentSimState = SIM_STATES.START;

window.addEventListener('keydown', (e) => {
    keysPressed[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', (e) => {
    keysPressed[e.key.toLowerCase()] = false;
});

// Detectar inicio/fin de soldadura
// Detectar inicio/fin de soldadura - OBSOLETO, ahora usamos botones HUD
// window.addEventListener('mousedown', () => { if (ui.resultScreen?.style.display === 'flex') isWelding = true; });
// window.addEventListener('mouseup', () => isWelding = false);

function init() {
    // Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);
    scene.fog = new THREE.Fog(0x0a0a0f, 20, 100);

    // Cámara
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(5, 5, 5);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Controles
    try {
        const OC = THREE.OrbitControls || window.OrbitControls;
        if (OC) {
            controls = new OC(camera, renderer.domElement);
            // Permitir solo ver la parte superior de la mesa (0 a 90 grados)
            controls.minPolarAngle = 0;
            controls.maxPolarAngle = Math.PI / 2; 
            
            // Interrumpir transición automática si el usuario interactúa
            const stopTransition = () => { isCameraTransitioning = false; };
            renderer.domElement.addEventListener('mousedown', stopTransition);
            renderer.domElement.addEventListener('touchstart', stopTransition);
            renderer.domElement.addEventListener('wheel', stopTransition);
        } else {
            console.error("OrbitControls not found!");
        }
    } catch (e) {
        console.error("Error initializing controls:", e);
    }

    // Iluminación optimizada (menos brillos molestos)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    // Luces de acento (neón sutil - reducidas para no teñir objetos)
    const pointLight1 = new THREE.PointLight(0x00f3ff, 2, 50); 
    pointLight1.position.set(5, 5, 5);
    scene.add(pointLight1);
    
    const pointLight2 = new THREE.PointLight(0xbc13fe, 1.5, 50); 
    pointLight2.position.set(-5, 2, -5);
    scene.add(pointLight2);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(2, 10, 5);
    scene.add(directionalLight);
    
    // Grid de taller (más sutil)
    const grid = new THREE.GridHelper(10, 10, 0x00f3ff, 0x111111);
    grid.material.opacity = 0.1;
    grid.material.transparent = true;
    scene.add(grid);

    // Mesa de soldadura profesional (Geometría extruida con AGUJEROS REALES)
    const tableSize = 5;
    const tableThickness = 0.1; // 10mm solicitado
    
    const shape = new THREE.Shape();
    shape.moveTo(-tableSize/2, -tableSize/2);
    shape.lineTo(tableSize/2, -tableSize/2);
    shape.lineTo(tableSize/2, tableSize/2);
    shape.lineTo(-tableSize/2, tableSize/2);
    shape.closePath();

    // Añadir agujeros en rejilla
    const holeRadius = 0.08; // Aprox 16mm diámetro
    const spacing = 0.5; // Agujeros cada 50mm
    for (let x = -tableSize/2 + spacing; x < tableSize/2; x += spacing) {
        for (let y = -tableSize/2 + spacing; y < tableSize/2; y += spacing) {
            const holePath = new THREE.Path();
            holePath.absarc(x, y, holeRadius, 0, Math.PI * 2, true);
            shape.holes.push(holePath);
        }
    }

    const extrudeSettings = {
        depth: tableThickness,
        bevelEnabled: false
    };

    const mesaGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const mesaMat = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1e,
        metalness: 0.2, // Toque metálico sutil pero mayormente mate
        roughness: 0.8
    });
    
    const mesa = new THREE.Mesh(mesaGeom, mesaMat);
    mesa.name = "mesa";
    mesa.rotation.x = -Math.PI / 2; // Acostar la mesa
    mesa.position.y = -tableThickness; // Ajustado: la cara superior estará exactamente en 0
    scene.add(mesa);

    window.addEventListener('resize', onWindowResize);

    // Initial state
    switchView(ui.welcomeScreen);
}

function startApp() {
    console.log("Running startApp...");
    switchView(ui.questionScreen);
    renderQuestion();
}

function switchView(screenToShow) {
    console.log("Switching to screen:", screenToShow?.id);
    
    // Ocultar todas las pantallas usando la clase active y display
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    
    // Mostrar la pantalla objetivo
    if (screenToShow) {
        screenToShow.style.display = 'flex';
        screenToShow.classList.add('active');
    }
}

function renderQuestion() {
    const q = questionsData[currentQuestionIndex];
    if (!q) return;

    ui.questionTitle.textContent = q.title;
    ui.stepCount.textContent = `STEP ${String(currentQuestionIndex + 1).padStart(2, '0')}/${String(questionsData.length).padStart(2, '0')}`;
    ui.progressBar.style.width = `${((currentQuestionIndex + 1) / questionsData.length) * 100}%`;

    ui.optionsGallery.innerHTML = '';
    q.options.forEach(opt => {
        const card = document.createElement('div');
        card.className = 'option-card';
        card.innerHTML = `
            <img src="${opt.imgSrc}" alt="${opt.label}">
            <h3>${opt.label}</h3>
        `;
        card.onclick = () => selectOption(q.id, opt);
        ui.optionsGallery.appendChild(card);
    });

    ui.btnBack.style.visibility = currentQuestionIndex === 0 ? 'hidden' : 'visible';
}

function selectOption(qId, option) {
    userChoices.push({ qId, ...option });
    questionHistory.push(currentQuestionIndex);
    
    if (currentQuestionIndex < questionsData.length - 1) {
        currentQuestionIndex++;
        renderQuestion();
    } else {
        showSummary();
    }
}

function goBack() {
    if (questionHistory.length > 0) {
        currentQuestionIndex = questionHistory.pop();
        userChoices.pop();
        renderQuestion();
    }
}

function showSummary() {
    switchView(ui.resultScreen);
    ui.visualSummary.innerHTML = '';
    
    userChoices.forEach(choice => {
        const item = document.createElement('div');
        item.className = 'summary-item';
        
        let label = choice.qId.replace('q', '').replace('_', ' ').toUpperCase();
        if (label.includes('2 JOINT')) label = 'UNIÓN';
        if (label.includes('6 PROCESS')) label = 'PROCESO';

        item.innerHTML = `
            <div class="summary-label">${label}</div>
            <div class="summary-value">${choice.label}</div>
        `;
        ui.visualSummary.appendChild(item);
    });

    update3DModel();
    
    // Show scene when simulation starts
    if (renderer && renderer.domElement) {
        renderer.domElement.style.opacity = '1';
    }
    
    // Iniciar HUD de simulación
    if (ui.simHud) {
        ui.simHud.style.display = 'block';
        setSimState(SIM_STATES.START);
    }
}

function update3DModel() {
    console.log("Actualizando escena 3D con:", userChoices);
    
    // Buscar selecciones específicas
    const materialChoice = userChoices.find(c => c.qId === 'q5_material')?.value || 'acero_carbono';
    const jointChoice = userChoices.find(c => c.qId === 'q2_joint')?.value;
    const processChoice = userChoices.find(c => c.qId === 'q6_process')?.value;
    // 0. Limpiar objetos previos (Búsqueda por nombre exacta)
    const oldPiece = scene.getObjectByName("piece-container");
    const oldTool = scene.getObjectByName("current-tool");
    const oldBeads = scene.getObjectByName("bead-container");
    const oldMarker = scene.getObjectByName("start-marker");
    const oldDistLabel = scene.getObjectByName("distance-label");
    if (oldPiece) scene.remove(oldPiece);
    if (oldTool) scene.remove(oldTool);
    if (oldBeads) scene.remove(oldBeads);
    if (oldMarker) scene.remove(oldMarker);
    if (oldDistLabel) scene.remove(oldDistLabel);
    
    // Limpiar indicadores previos
    if (angleIndicator) scene.remove(angleIndicator);
    if (angleLabel) scene.remove(angleLabel);
    if (distanceIndicator) scene.remove(distanceIndicator);

    // Reiniciar contenedor de cordón
    beadContainer = new THREE.Group();
    beadContainer.name = "bead-container";

    // Escala: 1 unidad = 100mm -> 250mm = 2.5, 10mm = 0.1
    plateThickness = 0.1; // Espesor fijo de 10mm solicitado 
    const t = plateThickness;

    // 1. Configurar Material con Textura Procedural de Metal Cepillado (Matte)
    const metalCanvas = document.createElement('canvas');
    metalCanvas.width = 256;
    metalCanvas.height = 256;
    const mctx = metalCanvas.getContext('2d');
    
    // Base mate
    let colorHexStr = '#777777';
    let metalness = 0; // Mate total
    let roughness = 1; // Rugosidad máxima

    if (materialChoice === 'inox') { colorHexStr = '#c0c0c5'; }
    else if (materialChoice === 'aluminio') { colorHexStr = '#b0b0b0'; }
    else if (materialChoice === 'acero_carbono') { colorHexStr = '#333333'; }

    mctx.fillStyle = colorHexStr;
    mctx.fillRect(0, 0, 256, 256);

    // Ruido cepillado (rayas finas)
    mctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for(let i=0; i<300; i++) {
        const x = Math.random() * 256;
        const h = Math.random() * 5 + 1;
        mctx.lineWidth = Math.random() * 0.5;
        mctx.beginPath();
        mctx.moveTo(x, 0);
        mctx.lineTo(x, 256);
        mctx.stroke();
    }
    
    // Manchas de laminado/óxido sutil
    mctx.fillStyle = 'rgba(0,0,0,0.03)';
    for(let i=0; i<10; i++) {
        mctx.beginPath();
        mctx.arc(Math.random()*256, Math.random()*256, Math.random()*40, 0, Math.PI*2);
        mctx.fill();
    }

    const metalTex = new THREE.CanvasTexture(metalCanvas);
    metalTex.wrapS = metalTex.wrapT = THREE.RepeatWrapping;
    metalTex.repeat.set(1, 4); // El cepillado se estira a lo largo de la pieza

    const plateMat = new THREE.MeshStandardMaterial({ 
        color: new THREE.Color(colorHexStr), 
        map: metalTex,
        metalness: metalness, 
        roughness: roughness,
        envMapIntensity: 0 // Sin intensidad de entorno
    });

    // 2. Crear Piezas según Unión
    const L = 2.5; // 250mm
    const pieceGroup = new THREE.Group();
    pieceGroup.name = "piece-container";
    let isTJoint = false;
    
    if (jointChoice === 'en_t') {
        isTJoint = true;
        // Placa base
        const baseGeom = new THREE.BoxGeometry(L, t, 0.8);
        const basePlate = new THREE.Mesh(baseGeom, plateMat);
        basePlate.position.y = t / 2;
        pieceGroup.add(basePlate);

        // Placa vertical (Unión en T)
        const vertGeom = new THREE.BoxGeometry(L, 0.6, t); 
        const vertPlate = new THREE.Mesh(vertGeom, plateMat);
        vertPlate.position.set(0, 0.3 + t, 0); 
        pieceGroup.add(vertPlate);
    } else {
        // Unión a tope
        const plateGeom = new THREE.BoxGeometry(L, t, 0.8);
        const gap = 0.01; // Separación de raíz técnica (1mm)
        
        const p1 = new THREE.Mesh(plateGeom, plateMat);
        p1.position.set(0, t / 2, -(0.4 + gap/2));
        pieceGroup.add(p1);

        const p2 = new THREE.Mesh(plateGeom, plateMat);
        p2.position.set(0, t / 2, (0.4 + gap/2));
        pieceGroup.add(p2);
    }
    
    pieceGroup.userData.isTJoint = isTJoint;
    scene.add(pieceGroup);

    // Indicador de punto inicial (Círculo Verde)
    const markerGeom = new THREE.RingGeometry(0.08, 0.1, 32); // Aro para que se vea la junta debajo
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const marker = new THREE.Mesh(markerGeom, markerMat);
    marker.name = "start-marker";
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(-1.25, t + 0.005, isTJoint ? 0.05 : 0);
    marker.visible = false;
    scene.add(marker);

    // 3. Herramienta visual detallada (Logo Colors: #00f3ff, #bc13fe)
    const toolGroup = new THREE.Group();
    toolGroup.name = "current-tool";
    
    const neonBlue = 0x00f3ff;
    const neonPurple = 0xbc13fe;
    const plasticMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.1 });
    const logoBlueMat = new THREE.MeshStandardMaterial({ color: neonBlue, emissive: neonBlue, emissiveIntensity: 0.2 });
    const logoPurpleMat = new THREE.MeshStandardMaterial({ color: neonPurple, emissive: neonPurple, emissiveIntensity: 0.2 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 1, roughness: 0.2 });

    // 3. Herramienta visual simplificada (Cilindro tipo Electrodo - 3.25mm x 350mm)
    // Usamos el toolGroup ya declarado arriba
    
    // El pivote (0,0,0) del grupo será la punta del electrodo
    // Escala: 1 unit = 100mm. Diam: 3.25mm -> R: 0.01625. Largo: 350mm -> H: 3.5
    const electrodeGeom = new THREE.CylinderGeometry(0.01625, 0.01625, 3.5, 12);
    const brownMat = new THREE.MeshStandardMaterial({ 
        color: 0xA67B5B, // Marrón cuero/arcilla más saturado
        roughness: 1.0,   // Sin reflejos
        metalness: 0.0   // No metálico
    });
    const electrodeMesh = new THREE.Mesh(electrodeGeom, brownMat);
    electrodeMesh.position.y = 1.75; // La punta inferior en 0 (Largo/2)
    toolGroup.add(electrodeMesh);

    // Detalle decorativo superior (Logo Purple) - Parte descubierta del alma
    const capGeom = new THREE.CylinderGeometry(0.013, 0.013, 0.1);
    const capMesh = new THREE.Mesh(capGeom, metalMat);
    capMesh.position.y = 3.45;
    toolGroup.add(capMesh);

    // Anillo de marca
    const ringGeom = new THREE.TorusGeometry(0.018, 0.003, 8, 32);
    const ring = new THREE.Mesh(ringGeom, logoPurpleMat);
    ring.position.y = 3.3;
    ring.rotation.x = Math.PI / 2;
    toolGroup.add(ring);

    // 4. Posicionar Herramienta sobre la Junta
    toolGroup.name = "current-tool";
    
    // El pivote (0,0,0) del toolGroup es la punta
    // Guardamos la posición base inicial según la junta
    const baseZ = isTJoint ? 0.05 : 0; 
    toolGroup.userData.basePosition = new THREE.Vector3(0, t, baseZ);
    toolGroup.position.copy(toolGroup.userData.basePosition);
    
    // Orientación: Perfectamente vertical
    toolGroup.rotation.set(0, 0, 0);
    
    // --- INDICADOR DE ÁNGULO (MODIFICADO: REFERENCIA EN LA CHAPA) ---
    angleIndicator = new THREE.Group();
    angleIndicator.name = "angle-indicator";
    
    const angleIndicatorMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8 });
    const thickLineGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.7, 8);
    
    // Referencia Horizontal (Chapa)
    const refLinePlate = new THREE.Mesh(thickLineGeom, angleIndicatorMat.clone());
    refLinePlate.rotation.z = Math.PI / 2;
    refLinePlate.position.x = 0.35; // Inicial, se actualizará dinámicamente
    angleIndicator.add(refLinePlate);
    angleIndicator.userData.refLinePlate = refLinePlate;



    // Arco de Grados (Contenedor para recreación dinámica)
    const arcContainer = new THREE.Group();
    angleIndicator.add(arcContainer);
    angleIndicator.userData.arcContainer = arcContainer;

    scene.add(angleIndicator);
    angleIndicator.visible = false;
    
    // Reiniciar offset, rotación y soldadura al cambiar de modelo
    toolOffset = { x: 0, y: 0, z: 0 };
    toolRotation = { x: 0, z: 0 };
    isWelding = false;
    electrodeCurrentHeight = electrodeInitialHeight;
    lastBeadPos.set(100, 100, 100); // Forzar primer punto
    
    // Añadir efectos de ARCO
    arcLight = new THREE.PointLight(0xffffff, 0, 2);
    arcLight.position.set(0, 0, 0); // En la punta (pivote)
    toolGroup.add(arcLight);

    // Glare (Destello visual)
    const glareCanvas = document.createElement('canvas');
    glareCanvas.width = 64; glareCanvas.height = 64;
    const gctx = glareCanvas.getContext('2d');
    const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.2, 'rgba(0, 243, 255, 0.8)');
    grad.addColorStop(0.5, 'rgba(0, 243, 255, 0.2)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 64, 64);
    
    const glareMap = new THREE.CanvasTexture(glareCanvas);
    const glareMat = new THREE.SpriteMaterial({ map: glareMap, transparent: true, blending: THREE.AdditiveBlending });
    arcGlare = new THREE.Sprite(glareMat);
    arcGlare.scale.set(0.3, 0.3, 1);
    arcGlare.visible = false;
    toolGroup.add(arcGlare);

    // Sistema de CHISPAS (Partículas simple)
    const sparkCount = 100;
    const sparkGeom = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(sparkCount * 3);
    const sparkVels = [];
    for(let i=0; i<sparkCount; i++) {
        sparkVels.push(new THREE.Vector3());
    }
    sparkGeom.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = new THREE.PointsMaterial({ color: 0xffaa00, size: 0.015, transparent: true, blending: THREE.AdditiveBlending });
    sparkParticles = new THREE.Points(sparkGeom, sparkMat);
    sparkParticles.userData.velocities = sparkVels;
    sparkParticles.userData.activeCount = 0;
    scene.add(sparkParticles);

    // beadContainer ya se creó y nombró al principio de la función
    scene.add(beadContainer);
    
    // 2. Etiqueta de Texto (Canvas Texture)

    // 2. Etiqueta de Texto (Cota de grados)
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 512; labelCanvas.height = 128; // Doble de ancho para frases largas
    const lctx = labelCanvas.getContext('2d');
    
    // El fondo se dibujará dinámicamente en el bucle

    lctx.font = 'Bold 55px Inter, Arial';
    lctx.textAlign = 'center';
    lctx.fillStyle = '#00ff00'; 
    lctx.fillText('Genial', 128, 85); 
    
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.SpriteMaterial({ 
        map: labelTex, 
        transparent: true,
        depthTest: false,
        depthWrite: false
    });
    angleLabel = new THREE.Sprite(labelMat);
    angleLabel.renderOrder = 1000;
    angleLabel.scale.set(0.6, 0.3, 1);
    angleLabel.visible = false;
    scene.add(angleLabel);

    // Etiqueta "Genial" independiente para el paso 1
    const genialCanvas = document.createElement('canvas');
    genialCanvas.width = 256; genialCanvas.height = 128;
    const genialCtx = genialCanvas.getContext('2d');
    genialCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    genialCtx.beginPath(); genialCtx.roundRect(10, 20, 236, 88, 20); genialCtx.fill();
    genialCtx.strokeStyle = '#00ff00'; genialCtx.lineWidth = 4; genialCtx.stroke();
    genialCtx.font = 'Bold 48px Inter, Arial'; genialCtx.textAlign = 'center'; genialCtx.fillStyle = '#00ff00';
    genialCtx.fillText('Perfecto', 128, 85);
    const genialTex = new THREE.CanvasTexture(genialCanvas);
    const genialMat = new THREE.SpriteMaterial({ map: genialTex, transparent: true, depthTest: false, depthWrite: false });
    genialLabel = new THREE.Sprite(genialMat);
    genialLabel.renderOrder = 1001;
    genialLabel.scale.set(0.6, 0.3, 1);
    genialLabel.visible = false;
    scene.add(genialLabel);

    // 3. Guía de Distancia (Cota)
    distanceIndicator = new THREE.Group();
    distanceIndicator.name = "distance-indicator";
    
    const distIndicatorMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const verticalLineGeom = new THREE.CylinderGeometry(0.005, 0.005, 1, 6);
    const verticalLine = new THREE.Mesh(verticalLineGeom, distIndicatorMat);
    verticalLine.position.y = -0.5; // Origin at worldTip, extends down
    distanceIndicator.add(verticalLine);

    // Top horizontal tick
    const tickGeom = new THREE.CylinderGeometry(0.005, 0.005, 0.1, 6);
    const topTick = new THREE.Mesh(tickGeom, distIndicatorMat);
    topTick.rotation.z = Math.PI / 2;
    distanceIndicator.add(topTick);

    // Bottom horizontal tick (at -1, will be scaled)
    const bottomTick = new THREE.Mesh(tickGeom, distIndicatorMat);
    bottomTick.rotation.z = Math.PI / 2;
    bottomTick.position.y = -1;
    distanceIndicator.add(bottomTick);
    
    // Dist Label (Enlarged)
    const distLabelCanvas = document.createElement('canvas');
    distLabelCanvas.width = 512; distLabelCanvas.height = 160;
    const dlctx = distLabelCanvas.getContext('2d');
    dlctx.font = 'Black 130px Orbitron, Arial'; // Massive font
    dlctx.textAlign = 'center';
    dlctx.fillStyle = '#ffffff';
    dlctx.fillText('0 mm', 256, 110);
    const distLabelTex = new THREE.CanvasTexture(distLabelCanvas);
    const distLabelMat = new THREE.SpriteMaterial({ map: distLabelTex, transparent: true, depthTest: false }); 
    const distLabel = new THREE.Sprite(distLabelMat);
    distLabel.name = "distance-label";
    distLabel.scale.set(0.8, 0.25, 1); // Mega scale
    distLabel.visible = false;
    scene.add(distLabel);
    distanceIndicator.userData.label = distLabel;

    scene.add(distanceIndicator);

    scene.add(toolGroup);

    // Teletransporte de cámara para visualización clara y cercana
    const targetPos = new THREE.Vector3(0, t, 0);
    camera.position.set(1.5, 0.8, 1.5); 
    if (controls) {
        controls.target.copy(targetPos);
        controls.update(); 
    }
    
    // Sincronizar targets de animación
    targetCamPos.set(1.5, 0.8, 1.5);
    targetLookAt.copy(targetPos);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

let lastTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    
    const currentTime = performance.now();
    const deltaTime = Math.min(0.05, (currentTime - lastTime) / 1000); 
    lastTime = currentTime;

    try {

    // --- 1. SUAVIZADO DE CÁMARA (Glide logic - siempre activo) ---
    if (isCameraTransitioning && camera && targetCamPos && targetLookAt) {
        camera.position.lerp(targetCamPos, 0.05);
        if (controls) {
            controls.target.lerp(targetLookAt, 0.05);
        }
        
        // Detener el planeo si estamos muy cerca del objetivo
        const dPos = camera.position.distanceTo(targetCamPos);
        if (dPos < 0.01) {
            isCameraTransitioning = false;
        }
    }

    // --- 2. DETECTAR INTERACCIÓN (Para romper demos o esperas) ---
    const isInteracting = keysPressed['a'] || keysPressed['d'] || keysPressed['w'] || keysPressed['s'] || 
                         keysPressed['c'] || keysPressed['v'] || keysPressed['z'] || keysPressed['x'] || 
                         keysPressed['q'] || keysPressed['e'] || (isMobileDevice && Math.abs(mobileDisplacement) > 0.1);

    if (isInteracting) {
        stepIntroTime = 0;
        isWaitingForCam = false;
    }

    const lerpFactor = 15.0; // Mayor sensibilidad
    toolOffset.x += (targetToolOffset.x - toolOffset.x) * lerpFactor * deltaTime;
    toolOffset.y += (targetToolOffset.y - toolOffset.y) * lerpFactor * deltaTime;
    toolOffset.z += (targetToolOffset.z - toolOffset.z) * lerpFactor * deltaTime;

    toolRotation.x += (targetToolRotation.x - toolRotation.x) * lerpFactor * deltaTime;
    toolRotation.z += (targetToolRotation.z - toolRotation.z) * lerpFactor * deltaTime;

    // Lógica de movimiento de la herramienta
    const currentTool = scene.getObjectByName("current-tool");
    if (currentTool) {
        // Bloquear movimientos según estado
        const canRotate = currentSimState === SIM_STATES.AVANCE || currentSimState === SIM_STATES.TRABAJO || currentSimState >= SIM_STATES.WELDING;
        const canMoveH = currentSimState === SIM_STATES.POSITION || currentSimState >= SIM_STATES.WELDING; 
        const canMoveV = currentSimState === SIM_STATES.DISTANCE || currentSimState >= SIM_STATES.WELDING; 

        if (stepIntroTime > 0) {
            // No mover el electrodo ni el slicer hasta que la cámara llegue al sitio
            if (currentSimState === SIM_STATES.POSITION && isWaitingForCam) {
                const dPos = targetCamPos ? camera.position.distanceTo(targetCamPos) : 0;
                if (!isCameraTransitioning || dPos < 0.1) {
                    isWaitingForCam = false;
                    console.log("Cámara lista, iniciando demo...");
                }
            }

            if (!isWaitingForCam) {
                stepIntroTime -= deltaTime;

                if (currentSimState === SIM_STATES.POSITION) {
                    // COREOGRAFÍA CONTINUA (Súper fluida)
                    const elapsed = 4.0 - stepIntroTime;
                    if (elapsed < 1.0) {
                        targetDemoCycle = -0.5 * elapsed;
                    } else if (elapsed < 3.2) {
                        // Reducido a la mitad hacia la derecha (0.75 en lugar de 1.5)
                        let t = (elapsed - 1.0) / 2.2;
                        targetDemoCycle = -0.5 + (1.25 * t); 
                    } else {
                        // Retorno desde 0.75 al centro
                        let t = Math.min(1.0, (elapsed - 3.2) / 0.8);
                        targetDemoCycle = 0.75 * (1.0 - t);
                    }

                    // Mapeo directo para evitar lag
                    targetToolOffset.x = targetDemoCycle;
                    targetToolOffset.z = 0;
                    
                    // --- SEGUIMIENTO DE CÁMARA POR PIVOTE (No marea) ---
                    // La cámara se queda fija en una posición y solo gira el "cuello" para seguir al electrodo
                    const worldPos = new THREE.Vector3();
                    currentTool.getWorldPosition(worldPos);
                    
                    targetLookAt.x = worldPos.x;
                    targetCamPos.x = -0.625; // Posición fija para evitar mareo (panning)
                    isCameraTransitioning = true; 

                    // Forzar centro absoluto al terminar
                    if (stepIntroTime < 0.05) {
                        targetToolOffset.x = 0;
                        smoothDemoInput = 0;
                        // Volver a la vista de trabajo centrada al acabar
                        targetCamPos.set(-0.625, 0.8, 2.5);
                        targetLookAt.set(-0.625, 0.2, 0);
                        isCameraTransitioning = true;
                    }
                    targetToolOffset.x = Math.max(-1.5, Math.min(1.5, targetToolOffset.x));

                } else if (currentSimState === SIM_STATES.AVANCE || currentSimState === SIM_STATES.TRABAJO) {
                    const elapsed = 4.0 - stepIntroTime;
                    
                    if (elapsed < 3.0) {
                        // Fase 1 y 2: Movimiento coordinado de mando y electrodo
                        if (elapsed < 1.5) {
                            targetDemoCycle = -1.0; 
                        } else {
                            let t = Math.min(1.0, (elapsed - 1.5) / 1.5);
                            targetDemoCycle = -1.0 + (1.8333 * t); // Llega a 0.8333 (45º)
                        }

                        // Sincronización de rotación (corrigiendo el sentido para TRABAJO)
                        if (currentSimState === SIM_STATES.AVANCE) {
                            targetToolRotation.z = -smoothDemoInput * (Math.PI * 0.3); // Avance: Signo negativo
                        } else {
                            targetToolRotation.x = smoothDemoInput * (Math.PI * 0.3);  // Trabajo: Signo positivo (CORREGIDO)
                        }
                    } else {
                        // Fase 3: BLOQUEO DE ELECTRODO EN 45º Y RETORNO DE SLICER A 0
                        targetDemoCycle = 0;
                        if (currentSimState === SIM_STATES.AVANCE) {
                            targetToolRotation.z = -(Math.PI / 4); 
                        } else {
                            targetToolRotation.x = (Math.PI / 4); // Lado correcto y sincronizado
                        }
                    }

                    // El smoothDemoInput siempre persigue al target
                    const angleLerp = 6.0;
                    smoothDemoInput += (targetDemoCycle - smoothDemoInput) * angleLerp * deltaTime;

                    // Limpieza final: Forzar valores exactos al terminar
                    if (stepIntroTime < 0.1) {
                        if (currentSimState === SIM_STATES.AVANCE) {
                            targetToolRotation.z = -(Math.PI / 4);
                        } else {
                            targetToolRotation.x = (Math.PI / 4);
                        }
                        smoothDemoInput = 0; 
                    }
                    
                } else if (currentSimState === SIM_STATES.DISTANCE || currentSimState === SIM_STATES.READY) {
                    targetDemoCycle = Math.sin(currentTime * 0.002); // Oscilación de altura
                    targetToolOffset.y = 0.03 + (smoothDemoInput + 1) * 0.03; 
                    if (currentSimState === SIM_STATES.READY) {
                        // En READY también movemos un poco el eje X para demostrar el slider
                        targetToolOffset.x = smoothDemoInput * 0.5; 
                    }
                }

                // SUAVIZAR EL INPUT DE LA DEMO (Reduced for fluidity)
                const demoLerp = 2.0; 
                smoothDemoInput += (targetDemoCycle - smoothDemoInput) * demoLerp * deltaTime;

                // SINCRONIZAR UI DIRECTAMENTE CON EL ELECTRODO
                if (ui.joystickKnob && ui.universalJoystick) {
                    const trackWidth = ui.universalJoystick.clientWidth || 300;
                    const knobWidth = ui.joystickKnob.clientWidth || 50;
                    const mPath = (trackWidth - knobWidth) / 2;
                    
                    if (mPath > 0) {
                        ui.joystickKnob.style.transition = 'none';
                        let uiOffset = smoothDemoInput; 
                        
                        if (currentSimState === SIM_STATES.POSITION) {
                            // Sincronización 1:1 con la posición real (máximo 1.5)
                            uiOffset = targetToolOffset.x / 1.5; 
                        } else if (currentSimState === SIM_STATES.AVANCE || currentSimState === SIM_STATES.TRABAJO) {
                            // En ángulos, el joystick sigue al ciclo suavizado directamente
                            uiOffset = smoothDemoInput;
                        }

                        ui.joystickKnob.style.transform = `translateX(${uiOffset * mPath}px)`;
                    }
                }

                if (ui.sliderVert) {
                    ui.sliderVert.value = (targetToolOffset.y * 10).toFixed(3);
                }
                if (ui.sliderLong) {
                    ui.sliderLong.value = targetToolOffset.x.toFixed(3);
                }
            }
        } else {
            // --- CONTROL MANUAL ---
            if (canMoveH) {
                if (currentSimState === SIM_STATES.WELDING && isWelding) {
                    targetToolOffset.x += BASE_WELD_SPEED * weldSpeedMultiplier * deltaTime;
                    targetToolOffset.x = Math.min(1.25, targetToolOffset.x);
                } else if (currentSimState !== SIM_STATES.WELDING) {
                    if (keysPressed['a']) targetToolOffset.x -= moveSpeed * deltaTime;
                    if (keysPressed['d']) targetToolOffset.x += moveSpeed * deltaTime;
                    if (keysPressed['w']) targetToolOffset.z -= moveSpeed * deltaTime;
                    if (keysPressed['s']) targetToolOffset.z += moveSpeed * deltaTime;
                }
            }
            
            if (canMoveV) {
                const sensitivity = (currentSimState === SIM_STATES.DISTANCE || currentSimState === SIM_STATES.READY) ? 0.05 : 0.5; 
                const sMoveSpeed = moveSpeed * sensitivity;
                if (keysPressed['q']) targetToolOffset.y += sMoveSpeed * deltaTime;
                if (keysPressed['e']) targetToolOffset.y -= sMoveSpeed * deltaTime;
            }

            if (canRotate) {
                if (currentSimState === SIM_STATES.AVANCE || currentSimState >= SIM_STATES.WELDING) {
                    if (keysPressed['c']) targetToolRotation.z -= rotationSpeed * deltaTime;
                    if (keysPressed['v']) targetToolRotation.z += rotationSpeed * deltaTime;
                }
                if (currentSimState === SIM_STATES.TRABAJO || currentSimState >= SIM_STATES.WELDING) {
                    if (keysPressed['z']) targetToolRotation.x += rotationSpeed * deltaTime;
                    if (keysPressed['x']) targetToolRotation.x -= rotationSpeed * deltaTime;
                }
            }

            // --- MOBILE INPUT (Drives corresponding property) ---
            if (isMobileDevice && Math.abs(mobileDisplacement) > 0.01) {
                if (currentSimState === SIM_STATES.POSITION) targetToolOffset.x += mobileDisplacement * moveSpeed * deltaTime;
                else if (currentSimState === SIM_STATES.AVANCE) targetToolRotation.z -= mobileDisplacement * rotationSpeed * deltaTime;
                else if (currentSimState === SIM_STATES.TRABAJO) targetToolRotation.x += mobileDisplacement * rotationSpeed * deltaTime;
                else if (currentSimState === SIM_STATES.DISTANCE || currentSimState === SIM_STATES.READY) {
                    const s = currentSimState === SIM_STATES.DISTANCE ? 0.05 : 0.5;
                    targetToolOffset.y += mobileDisplacement * moveSpeed * s * deltaTime;
                }
            }
        }

        // (El manejo de stepIntroTime e isInteracting se movió al principio del loop para evitar deadlocks)


        // --- LÍMITES DE ROTACIÓN ...

        // --- LÍMITES DE ROTACIÓN (PREVENCIÓN DE COLISIONES) ---
        const maxTilt = Math.PI * 0.45; // 81 grados aprox (evitar estar totalmente plano)
        
        // 1. Límites generales (no atravesar la mesa/placa base)
        toolRotation.x = Math.max(-maxTilt, Math.min(maxTilt, toolRotation.x));
        // Límite Paso 2: Permitir oscilación amplia (hasta 70 grados = 160 acumulado)
        toolRotation.z = Math.max(-Math.PI*0.4, Math.min(Math.PI*0.4, toolRotation.z)); 
        

        // 2. Límites específicos por geometría (Unión en T)
        const pieceContainer = scene.getObjectByName("piece-container");
        if (pieceContainer && pieceContainer.userData.isTJoint) {
            const zTip = currentTool.position.z;
            const wallFront = 0.05;
            const wallBack = -0.05;

            // Si la punta está en la cara frontal de la pared vertical
            if (zTip >= wallFront - 0.01) {
                // No permitir inclinar hacia atrás (hacia la pared)
                // Rotación X positiva mueve el tope hacia +Z (fuera de la pared)
                // Rotación X negativa mueve el tope hacia -Z (hacia la pared)
                toolRotation.x = Math.max(0, toolRotation.x);
            } 
            // Si la punta está en la cara posterior de la pared vertical
            else if (zTip <= wallBack + 0.01) {
                // No permitir inclinar hacia adelante (hacia la pared)
                toolRotation.x = Math.min(0, toolRotation.x);
            }
        }

        // Limites translation (Longitudinal: ±1.25 para pieza de 250mm)
        toolOffset.x = Math.max(-1.25, Math.min(1.25, toolOffset.x));
        // Limites (Y: No atravesar la mesa, máx 0.5)
        toolOffset.y = Math.max(0, Math.min(0.5, toolOffset.y));
        // Limites (Lateral: ±0.1)
        toolOffset.z = Math.max(-0.1, Math.min(0.1, toolOffset.z));

        if (currentTool.userData.basePosition) {
            currentTool.position.x = currentTool.userData.basePosition.x + toolOffset.x;
            currentTool.position.y = currentTool.userData.basePosition.y + toolOffset.y;
            currentTool.position.z = currentTool.userData.basePosition.z + toolOffset.z;
        }
        currentTool.rotation.set(toolRotation.x, 0, toolRotation.z);

        const worldTip = new THREE.Vector3(0,0,0);
        currentTool.localToWorld(worldTip);

        // --- LÓGICA DE CONTACTO Y ARCO ---
        const distToSurface = worldTip.y - plateThickness; 
        const isTouching = distToSurface < 0.01;

        // Auto-transición de READY a WELDING al tocar
        if (currentSimState === SIM_STATES.READY && isTouching) {
            setSimState(SIM_STATES.WELDING);
        }
        
        // Validación Paso 1: Posicionamiento inicial
        if (currentSimState === SIM_STATES.POSITION) {
            const targetX = -1.25;
            const distToTarget = Math.abs(worldTip.x - targetX);
            const progress = Math.max(0, Math.min(1, 1 - (distToTarget / 1.25)));
            
            // Si la demo está activa y aún no ha llegado, forzamos la ida al punto de inicio
            if (stepIntroTime > 0 && isWaitingForCam) {
                targetCamPos.set(-0.625, 0.8, 2.5);
                targetLookAt.set(-0.625, 0.2, 0);
                isCameraTransitioning = true; 
            } else if (stepIntroTime <= 0) {
                // Si el usuario toca el slicer o termina la demo, seguimiento dinámico
                const halfway = (worldTip.x + targetX) / 2;
                targetLookAt.set(halfway, 0.2 + (0.1 - 0.2) * progress, 0);
                targetCamPos.set(halfway, 0.8, 2.5 + (0.7 - 2.5) * progress);
                isCameraTransitioning = true; 
            }

            const marker = scene.getObjectByName("start-marker");
            if (marker) {
                // Efecto de RESPIRACIÓN en el marcador
                const breathe = 1.0 + Math.sin(currentTime * 0.005) * 0.2;
                // marker.scale.set(breathe, breathe, 1); // Movido a la lógica de distancia
                
                const markerPos = new THREE.Vector3();
                marker.getWorldPosition(markerPos);
                const distH = new THREE.Vector2(worldTip.x, worldTip.z).distanceTo(new THREE.Vector2(markerPos.x, markerPos.z));
                
                if (distH < 0.08) {
                    marker.scale.set(1.1, 1.1, 1);
                    if (ui.btnNextStep.style.display === 'none') {
                        ui.btnNextStep.style.display = 'block';
                        ui.btnNextStep.classList.add('cta-animate');
                        ui.instrDesc.innerHTML = "<b>¡Punto encontrado!</b> Haz clic para continuar.";
                    }
                    if (genialLabel) {
                        genialLabel.visible = true;
                        // Posicionar encima del marcador, bien despejado hacia el usuario
                        genialLabel.position.set(markerPos.x, 0.4, markerPos.z + 0.2);
                        const labelScale = 0.2;
                        genialLabel.scale.set(labelScale, labelScale * 0.5, 1);
                        genialLabel.quaternion.copy(camera.quaternion);
                    }
                } else {
                    marker.scale.set(breathe, breathe, 1);
                    if (ui.btnNextStep.style.display === 'block') {
                        ui.btnNextStep.style.display = 'none';
                        ui.instrDesc.innerHTML = ui.instrDesc.dataset.base;
                    }
                    if (genialLabel) genialLabel.visible = false;
                }
            }
        }

        // Soldadura activa solo en estado WELDING y al tocar la chapa (Auto-start)
        const canWeld = currentSimState === SIM_STATES.WELDING && isTouching;
        isWelding = canWeld; // Actualizar flag global para efectos visuales

        if (currentSimState === SIM_STATES.WELDING) {
            // --- LÓGICA DE AVANCE IDEAL (Siempre visible en Paso 5) ---
            if (isWelding) {
                idealWeldX += BASE_WELD_SPEED * deltaTime;
                idealWeldX = Math.min(1.25, idealWeldX);
            }

            const weldMarker = scene.getObjectByName("start-marker");
            if (weldMarker) {
                weldMarker.visible = true;
                weldMarker.position.x = idealWeldX;
                weldMarker.position.z = 0; 
                
                // Comprobar proximidad
                const distToIdeal = Math.abs(worldTip.x - idealWeldX);
                const isInside = distToIdeal < 0.12; 
                
                // Solo mostrar verde/rojo si estamos soldando, de lo contrario verde (espera)
                if (isWelding) {
                    weldMarker.material.color.setHex(isInside ? 0x00ff00 : 0xff0000);
                } else {
                    weldMarker.material.color.setHex(0x00ff00); // Verde esperando el primer contacto
                }
                
                const pulse = 1 + Math.sin(performance.now() * 0.01) * 0.2;
                const scale = (isInside && isWelding) ? 0.8 : pulse;
                weldMarker.scale.set(scale, scale, scale);
                weldMarker.material.opacity = (isInside && isWelding) ? 0.8 : 0.4;
            }
        }

        if (canWeld) {
            // 1. EFECTOS DE ARCO
            if (arcLight) arcLight.intensity = (0.5 + Math.random() * 0.5) * 5; 
            if (arcGlare) {
                arcGlare.visible = true;
                const s = 0.3 + Math.random() * 0.3;
                arcGlare.scale.set(s, s, 1);
            }
            
            // El movimiento por velocidad ya se maneja en el bloque de canMoveH
            // pero nos aseguramos de que solo ocurra si isWelding es true.

            // 2. CONSUMO DE ELECTRODO
            const consumeAmount = consumptionRate * deltaTime;
            electrodeCurrentHeight -= consumeAmount;
            if (electrodeCurrentHeight < 0.2) electrodeCurrentHeight = 0.2;
            
            // Reducir el target de altura por la cantidad consumida para obligar al usuario a bajar
            targetToolOffset.y -= consumeAmount;
            if (ui.sliderVert) ui.sliderVert.value = targetToolOffset.y.toFixed(3);

            const electrodeMesh = currentTool.children[0];
            if (electrodeMesh) {
                const scaleY = electrodeCurrentHeight / electrodeInitialHeight;
                electrodeMesh.scale.y = scaleY;
                electrodeMesh.position.y = electrodeCurrentHeight / 2;
            }
            if (currentTool.children[1]) currentTool.children[1].position.y = electrodeCurrentHeight - 0.05;
            if (currentTool.children[2]) currentTool.children[2].position.y = electrodeCurrentHeight - 0.2;

            // 3. GENERACIÓN DE CORDÓN
            const dist = worldTip.distanceTo(lastBeadPos);
            if (dist > 0.02) { 
                const beadGeom = new THREE.IcosahedronGeometry(0.04, 1);
                const beadMat = new THREE.MeshStandardMaterial({ 
                    color: 0x333333, 
                    emissive: 0xffaa00, 
                    emissiveIntensity: 2.0 
                });
                const bead = new THREE.Mesh(beadGeom, beadMat);
                bead.position.copy(worldTip);
                bead.scale.set(1, 0.4, 1.2); 
                beadContainer.add(bead);
                lastBeadPos.copy(worldTip);
            }

            // Ocultar indicadores
            if (angleIndicator) angleIndicator.visible = false;
            if (angleLabel) angleLabel.visible = false;
            if (distanceIndicator) distanceIndicator.visible = false;
            const dLabel = scene.getObjectByName("distance-label");
            if (dLabel) dLabel.visible = false;

        } else {
            if (arcLight) arcLight.intensity = 0;
            if (arcGlare) arcGlare.visible = false;

            // --- ACTUALIZAR INDICADORES (Modo Prep) ---
            if (angleIndicator && distanceIndicator) {
                const isT = pieceContainer?.userData.isTJoint;
                
                // Mostrar DISTANCIA solo en el paso 4 o durante la soldadura
                const showDistance = currentSimState === SIM_STATES.DISTANCE || currentSimState >= SIM_STATES.WELDING;
                distanceIndicator.visible = (showDistance && !isTouching);
                distanceIndicator.position.copy(worldTip);
                
                const heightVal = Math.max(0.001, distToSurface);
                distanceIndicator.scale.y = heightVal;

                if (distanceIndicator.visible) {
                    const distMm = (heightVal * 100).toFixed(1);
                    const isPerfect = Math.abs(heightVal * 100 - 3) < 0.2; 
                    const isTooHigh = (heightVal * 100) >= 10;
                    const isTouchingPlate = (heightVal * 100) < 0.1;
                    
                    // Lógica de HUD dinámico para Distancia
                    if (isPerfect) {
                        if (ui.btnNextStep.style.display === 'none') {
                            ui.btnNextStep.style.display = 'block';
                            ui.btnNextStep.classList.add('cta-animate');
                            ui.instrDesc.innerHTML = "<b>¡Separación ideal!</b> Pulsa para ir al inicio.";
                        }
                    } else {
                        if (ui.btnNextStep.style.display === 'block') {
                            ui.btnNextStep.style.display = 'none';
                            ui.instrDesc.innerHTML = ui.instrDesc.dataset.base;
                        }
                    }

                    // Determinar Color: 0mm (Rojo) -> 3mm (Verde) -> 10mm+ (Rojo)
                    let cotaColor = 0xffffff; // Blanco base
                    if (isPerfect) cotaColor = 0x00ff00; // Verde brillante
                    else if (isTouchingPlate || isTooHigh) cotaColor = 0xff0000; // Rojo si toca o está muy lejos

                    const distLabel = distanceIndicator.userData.label;
                    if (distLabel) {
                        distLabel.visible = true;
                        const lctx = distLabel.material.map.image.getContext('2d');
                        lctx.clearRect(0, 0, 512, 160);
                        lctx.font = 'Black 130px Orbitron, Arial'; // Massive font
                        lctx.fillStyle = `#${new THREE.Color(cotaColor).getHexString()}`;
                        const text = isPerfect ? "3 mm Perfecto" : `${distMm} mm`;
                        lctx.fillText(text, 256, 110);
                        distLabel.material.map.needsUpdate = true;
                        
                        // Sprite siempre mira a cámara
                        distLabel.quaternion.copy(camera.quaternion);
                        
                        // Posicionamiento en el espacio del mundo (centrado en el hueco)
                        // Offset extremadamente pequeño en X para estar pegado a la línea
                        const labelOffset = new THREE.Vector3(-0.04, -0.5 * heightVal, 0.01);
                        distLabel.position.copy(worldTip).add(labelOffset);

                        // Update line colors
                        distanceIndicator.children.forEach(c => {
                            if (c.isMesh) c.material.color.setHex(cotaColor);
                        });
                    }
                } else {
                    const distLabel = distanceIndicator.userData.label;
                    if (distLabel) distLabel.visible = false;
                }
                
                // Mostrar ÁNGULO solo en pasos 2 y 3
                const isAvance = currentSimState === SIM_STATES.AVANCE;
                const isTrabajo = currentSimState === SIM_STATES.TRABAJO;
                angleIndicator.visible = (isAvance || isTrabajo) && (currentSimState !== SIM_STATES.DISTANCE);
                
                // Limpiar labels de ángulos si no estamos en esos pasos
                if (!angleIndicator.visible && angleLabel) angleLabel.visible = false;
                
                if (angleIndicator.visible) {
                    angleIndicator.position.copy(worldTip);
                    
                    if (isTrabajo) {
                        // 1. Inclinación de Avance (Z)
                        const qAdvance = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), toolRotation.z);
                        // 2. Giro lateral de 90 grados (Y)
                        const qSide = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
                        // Combinar: Primero inclinar, luego girar lateralmente
                        angleIndicator.quaternion.copy(qAdvance.multiply(qSide));
                    } else {
                        // Paso 2: Avance - Debe heredar cualquier inclinación lateral (X) aplicada previamente
                        angleIndicator.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), toolRotation.x);
                    }    
                    let idealAngle = 0;
                    let currentAngle = 0;
                    let electrodeRot = 0;
    
                    if (isTrabajo) {
                        const isT = pieceContainer?.userData.isTJoint;
                        idealAngle = isT ? Math.PI / 4 : 0; 
                        electrodeRot = currentTool.rotation.x; 
                        currentAngle = Math.abs(electrodeRot);
                    } else {
                        // Paso 2: ÁNGULO DE AVANCE - 80º desde la pieza (+X)
                        idealAngle = Math.PI * 80 / 180; 
                        electrodeRot = currentTool.rotation.z; 
                        currentAngle = (Math.PI / 2) + electrodeRot; // 90 + z
                    }
    
                    if (angleIndicator.visible) {
                        const diff = Math.abs(currentAngle - idealAngle);
                        // Tolerancia de 2 grados (0.035 rad) para el rango 78-82 respecto a 80
                        const isPerfectAngle = diff < 0.035; 
                        
                        // Lógica de HUD dinámico para Ángulos
                        if (isPerfectAngle) {
                            if (ui.btnNextStep.style.display === 'none') {
                                ui.btnNextStep.style.display = 'block';
                                ui.btnNextStep.classList.add('cta-animate');
                                ui.instrDesc.innerHTML = isAvance ? 
                                    "<b>¡Ángulo de avance correcto!</b> Pulsa para el siguiente." :
                                    "<b>¡Ángulo de trabajo correcto!</b> Pulsa para continuar.";
                            }
                        } else {
                            if (ui.btnNextStep.style.display === 'block') {
                                ui.btnNextStep.style.display = 'none';
                                ui.instrDesc.innerHTML = ui.instrDesc.dataset.base;
                            }
                        }

                        const errorFactor = Math.min(1, diff / 0.5);
                        const indicatorColor = new THREE.Color().setRGB(errorFactor, 1 - errorFactor, 0);

                        // Actualizar color y rotación del pivote del indicador

                        angleIndicator.children[0].material.color.copy(indicatorColor); // Ref horizontal (chapa)

                        // --- ACTUALIZAR ARCO DINÁMICO Y BARRA DE CHAPA ---
                        const arcContainer = angleIndicator.userData.arcContainer;
                        const refLinePlate = angleIndicator.userData.refLinePlate;
                        arcContainer.clear();
                        
                        let sideMultiplier = 1;
                        let angleFromPlate = 0;

                        if (isAvance) {
                            sideMultiplier = 1; // Bloqueado al lado derecho (hacia donde va la pieza)
                            angleFromPlate = currentAngle;
                        } else {
                            const rotSign = Math.sign(electrodeRot) || -1;
                            sideMultiplier = -rotSign;
                            angleFromPlate = Math.PI / 2 - Math.abs(electrodeRot);
                        }
                        
                        // Reposicionar barra de la chapa dinámicamente
                        if (refLinePlate) {
                            refLinePlate.position.x = 0.35 * sideMultiplier;
                        }

                        // El ángulo visual del arco es desde la horizontal (0) hasta el electrodo
                        const absArcAngle = Math.max(0.01, angleFromPlate);
                        
                        const torusGeom = new THREE.TorusGeometry(0.4, 0.01, 8, 30, absArcAngle);
                        const torus = new THREE.Mesh(torusGeom, new THREE.MeshBasicMaterial({ color: indicatorColor }));
                        
                        // Posicionar arco según el signo de rotación
                        if (sideMultiplier > 0) {
                            torus.rotation.z = 0; 
                        } else {
                            torus.rotation.z = Math.PI - absArcAngle;
                        }
                        arcContainer.add(torus);
        
                        if (angleLabel) {
                            angleLabel.visible = true;
                            
                            // CALCULAR POSICIÓN CENTRADA EN EL ARCO
                            const midAngle = angleFromPlate / 2;
                            const labelRadius = 0.55; 
                            
                            const lx = Math.cos(midAngle) * labelRadius * sideMultiplier;
                            const ly = Math.sin(midAngle) * labelRadius;
                            const localPos = new THREE.Vector3(lx, ly, 0.1); // Slightly forward
                            
                            localPos.applyQuaternion(angleIndicator.quaternion);
                            angleLabel.position.copy(worldTip).add(localPos);
                            angleLabel.scale.set(0.6, 0.15, 1);
                            angleLabel.quaternion.copy(camera.quaternion);

                            // Lógica de dibujo dinámico para ajustar la celda al texto
                            const displayDegrees = (angleFromPlate * 180 / Math.PI).toFixed(1);
                            const labelText = isPerfectAngle ? `${displayDegrees}° Perfecto` : `${displayDegrees}°`;
                            
                            const ctx = angleLabel.material.map.image.getContext('2d');
                            ctx.clearRect(0,0,512,128); // Limpiar el lienzo (ahora de 512)
                            ctx.font = 'Bold 55px Inter, Arial';
                            const textWidth = ctx.measureText(labelText).width;
                            const boxWidth = textWidth + 80; // Padding generoso
                            const boxX = (512 - boxWidth) / 2; // Centrar en el lienzo de 512
                            
                            const hexColor = `#${indicatorColor.getHexString()}`;
                            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                            ctx.beginPath(); 
                            ctx.roundRect(boxX, 20, boxWidth, 88, 20); 
                            ctx.fill();
                            ctx.strokeStyle = hexColor; 
                            ctx.lineWidth = 4; 
                            ctx.stroke();
                            
                            ctx.fillStyle = hexColor;
                            ctx.textAlign = 'center';
                            ctx.fillText(labelText, 256, 85); // Centrar texto en el lienzo de 512
                            
                            // Ajustar la escala del Sprite para mantener proporciones en el mundo 3D
                            const scaleX = 0.6 * (boxWidth / 256); 
                            angleLabel.scale.set(scaleX, 0.15, 1);
                            
                            angleLabel.material.map.needsUpdate = true;
                        }
                    }
                }
            }
        }

        // --- LÓGICA DE PARTÍCULAS (CHISPAS) ---
        if (sparkParticles && sparkParticles.geometry.attributes.position) {
            const positions = sparkParticles.geometry.attributes.position.array;
            const velocities = sparkParticles.userData.velocities;
            if (canWeld) {
                for(let i=0; i<2; i++) {
                    const idx = Math.floor(Math.random() * 100);
                    positions[idx*3] = worldTip.x;
                    positions[idx*3+1] = worldTip.y;
                    positions[idx*3+2] = worldTip.z;
                    velocities[idx].set((Math.random()-0.5)*2, Math.random()*2, (Math.random()-0.5)*2).multiplyScalar(deltaTime*50);
                }
            }
            for(let i=0; i<100; i++) {
                positions[i*3] += velocities[i].x * deltaTime;
                positions[i*3+1] += velocities[i].y * deltaTime;
                positions[i*3+2] += velocities[i].z * deltaTime;
                velocities[i].y -= 9.8 * deltaTime * 0.5;
                if (positions[i*3+1] < 0) positions[i*3+1] = -10; 
            }
            sparkParticles.geometry.attributes.position.needsUpdate = true;
        }

        // Lógica de ENFRIAMIENTO
        if (beadContainer) {
            beadContainer.children.forEach(bead => {
                if (bead.material.emissiveIntensity > 0) {
                    bead.material.emissiveIntensity -= deltaTime * 0.5;
                    if (bead.material.emissiveIntensity < 0) bead.material.emissiveIntensity = 0;
                }
            });
        }

        // (La lógica de Glide de cámara se movió al inicio del animate para asegurar ejecución constante)

        } // Fin if (currentTool)

        if (controls) controls.update();
        if (renderer && scene && camera) renderer.render(scene, camera);
    } catch (err) {
        console.warn("Animation Loop Error:", err);
    }
}

// NUEVA LÓGICA DE JOYSTICK PROPORCIONAL
let mobileDisplacement = 0; // -1 a 1

function initJoystick() {
    const knob = ui.joystickKnob;
    const container = ui.universalJoystick;
    if (!knob || !container) return;

    let isDragging = false;
    let startX = 0;
    let currentMaxPath = 100;

    const onStart = (e) => {
        isDragging = true;
        currentMaxPath = (container.clientWidth - knob.clientWidth) / 2;
        startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        knob.style.transition = 'none';
        knob.classList.remove('cta-animate');
        knob.classList.remove('cta-animate-slide');
    };

    const onMove = (e) => {
        if (!isDragging) return;
        if (currentMaxPath <= 0) currentMaxPath = (container.clientWidth - knob.clientWidth) / 2;
        if (currentMaxPath <= 0) return;

        const currentX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        let delta = currentX - startX;
        delta = Math.max(-currentMaxPath, Math.min(currentMaxPath, delta));
        knob.style.transform = `translateX(${delta}px)`;
        mobileDisplacement = delta / currentMaxPath;
    };

    const onEnd = () => {
        isDragging = false;
        mobileDisplacement = 0;
        knob.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        knob.style.transform = 'translateX(0)';
    };

    container.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    container.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
}
