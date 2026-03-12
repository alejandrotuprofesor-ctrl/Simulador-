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
let toolRotation = { x: 0, z: 0 };
let plateThickness = 0.1;
let consumptionRate = 0.05;
let electrodeInitialHeight = 3.5;
let electrodeCurrentHeight = 3.5;
let moveSpeed = 0.5;
let rotationSpeed = 1.0;
let lastBeadPos = new THREE.Vector3(100, 100, 100);

let arcLight, arcGlare, sparkParticles;
let beadContainer;
let angleIndicator, angleLabel, distanceIndicator;

// Cámara gliding
let isCameraTransitioning = false;

// Esperar a que el DOM esté listo
window.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed");
    
    // Detectar dispositivo
    isMobileDevice = checkIfMobile();
    if(isMobileDevice) document.body.classList.add('is-mobile');
    
    initUI();
    init();
    animate();
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
        universalJoystick: document.getElementById('universal-joystick')
    };

    // Initialize Proportional Joystick
    if (ui.universalJoystick) initJoystick();



    if (ui.btnStart) {
        ui.btnStart.addEventListener('click', (e) => {
            console.log("Start button clicked (addEventListener)!");
            startApp();
        }, true); // Use capture phase to ensure it's hit
        
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

    const pieceContainer = scene ? scene.getObjectByName("piece-container") : null;
    const isT = pieceContainer?.userData.isTJoint;
    
    // Ocultar todos los grupos móviles por defecto


    const marker = scene ? scene.getObjectByName("start-marker") : null;
    if (marker) marker.visible = (newState === SIM_STATES.POSITION);

    switch(newState) {
        case SIM_STATES.START:
            updateHud("INICIO", isMobileDevice ? 
                "<b>Selecciona para continuar</b>" : 
                "<b>Selecciona los parámetros</b>");
            ui.btnNextStep.style.display = 'block';
            ui.btnNextStep.textContent = "UBICAR ELECTRODO";
            if (ui.btnResultsBack) ui.btnResultsBack.textContent = "VER PROCESOS"; 
            ui.btnStartWeld.style.display = 'none';
            targetCamPos.set(4, 3, 4);
            targetLookAt.set(0, 0, 0);
            break;

        case SIM_STATES.POSITION:
            updateHud("Paso 1: Posicionamiento", isMobileDevice ?
                "Mueve la punta al <b>círculo verde</b>." :
                "Usa <b>A, W, S, D</b> para ir al <b>círculo verde</b>.");
            
            if (isMobileDevice && ui.mobileControls) ui.mobileControls.style.display = 'flex';

            ui.btnNextStep.style.display = 'none'; 
            ui.btnNextStep.textContent = "SIGUIENTE: ÁNGULO AVANCE";
            if (ui.btnResultsBack) ui.btnResultsBack.textContent = "VOLVER"; 
            ui.btnStartWeld.style.display = 'none';
            targetCamPos.set(-2, 1.5, 2);
            targetLookAt.set(-1.25, 0.2, 0);
            break;

        case SIM_STATES.AVANCE:
            updateHud("Paso 2: Ángulo de Avance", isMobileDevice ?
                "Ajusta la <b>inclinación longitudinal</b>." :
                "Usa <b>C</b> y <b>V</b> para inclinar el electrodo (15°).");
            
            if (isMobileDevice && ui.mobileControls) ui.mobileControls.style.display = 'flex';
            
            ui.btnNextStep.style.display = 'none';
            ui.btnNextStep.textContent = "SIGUIENTE: ÁNGULO TRABAJO";
            ui.btnStartWeld.style.display = 'none';
            targetCamPos.set(0, 1.0, 2.5); 
            targetLookAt.set(-1.25, 0.6, 0);
            break;

        case SIM_STATES.TRABAJO:
            updateHud("Paso 3: Ángulo de Trabajo", isMobileDevice ?
                "Ajusta la <b>inclinación lateral</b>." :
                "Usa <b>Z</b> y <b>X</b> para inclinar el electrodo.");
            
            if (isMobileDevice && ui.mobileControls) ui.mobileControls.style.display = 'flex';

            ui.btnNextStep.style.display = 'none';
            ui.btnNextStep.textContent = "SIGUIENTE: SEPARACIÓN";
            ui.btnStartWeld.style.display = 'none';
            targetCamPos.set(2.5, 1.0, 0);
            targetLookAt.set(-1.25, 0.6, 0);
            break;

        case SIM_STATES.DISTANCE:
            updateHud("Paso 4: Separación", isMobileDevice ?
                "Ajusta la altura a <b>3 mm</b>." :
                "Usa <b>Q</b> y <b>E</b> para ajustar la altura a <b>3 mm</b>.");
            
            if (isMobileDevice && ui.mobileControls) ui.mobileControls.style.display = 'flex';

            ui.btnNextStep.style.display = 'none';
            ui.btnNextStep.textContent = "SIGUIENTE: SOLDAR";
            ui.btnStartWeld.style.display = 'none';
            targetCamPos.set(-1.1, 0.15, 0.3); // Vista lateral extrema y cercana
            targetLookAt.set(-1.25, 0.12, 0); // Foco exacto en el hueco
            break;

        case SIM_STATES.READY:
            ui.instrTitle.textContent = "Paso 5: ¡Listo!";
            ui.instrDesc.textContent = isMobileDevice ?
                "Mantén pulsado SOLDAR para empezar." :
                "Asegúrate de que la punta toque ligeramente la pieza.";
            if (ui.mobileControls) ui.mobileControls.style.display = 'none';
            ui.btnNextStep.style.display = 'none';
            ui.btnStartWeld.style.display = 'block';
            ui.btnStartWeld.textContent = "EMPEZAR A SOLDAR";
            targetLookAt.set(0, 0.4, 0);
            break;

        case SIM_STATES.WELDING:
            ui.instrTitle.textContent = "Simulación en Curso";
            ui.instrDesc.textContent = isMobileDevice ?
                "Suelta para terminar." :
                "Mantén presionado para generar el arco.";
            ui.btnNextStep.style.display = 'none';
            ui.btnStartWeld.style.display = 'block';
            ui.btnStartWeld.textContent = "TERMINAR";
            break;
    }
    if (controls) controls.update();
}

function updateHud(title, desc) {
    if (ui.instrTitle) ui.instrTitle.textContent = title;
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
    
    // Luces de acento (neón sutil)
    const pointLight1 = new THREE.PointLight(0x00f3ff, 5, 50); // Reducido de 20 a 5
    pointLight1.position.set(5, 5, 5);
    scene.add(pointLight1);
    
    const pointLight2 = new THREE.PointLight(0xbc13fe, 3, 50); // Reducido de 15 a 3
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
    if (oldPiece) scene.remove(oldPiece);
    if (oldTool) scene.remove(oldTool);
    if (oldBeads) scene.remove(oldBeads);
    if (oldMarker) scene.remove(oldMarker);
    
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
    const electrodeMesh = new THREE.Mesh(electrodeGeom, logoBlueMat);
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

    // 2. Etiqueta de Texto (Canvas Texture)
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256; labelCanvas.height = 64;
    const lctx = labelCanvas.getContext('2d');
    lctx.font = 'Bold 40px Inter, Arial';
    lctx.textAlign = 'center';
    lctx.fillStyle = '#00ff00'; // Verde como el marcador
    lctx.fillText('Perfecto!', 128, 45); // Añadido !
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
    angleLabel = new THREE.Sprite(labelMat);
    angleLabel.scale.set(0.5, 0.125, 1);
    angleLabel.visible = false;
    scene.add(angleLabel);

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
    dlctx.strokeStyle = '#000000';
    dlctx.lineWidth = 8;
    dlctx.strokeText('0 mm', 256, 110);
    dlctx.fillText('0 mm', 256, 110);
    const distLabelTex = new THREE.CanvasTexture(distLabelCanvas);
    const distLabelMat = new THREE.SpriteMaterial({ map: distLabelTex, transparent: true, depthTest: false }); 
    const distLabel = new THREE.Sprite(distLabelMat);
    distLabel.scale.set(0.8, 0.25, 1); // Mega scale
    distLabel.position.set(0.15, -0.5, 0); // Positioned at local midpoint
    distanceIndicator.add(distLabel);
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

    // Lógica de movimiento de la herramienta
    const currentTool = scene.getObjectByName("current-tool");
    if (currentTool) {
        // Bloquear movimientos según estado
        const canRotate = currentSimState === SIM_STATES.AVANCE || currentSimState === SIM_STATES.TRABAJO || currentSimState >= SIM_STATES.WELDING;
        const canMoveH = currentSimState === SIM_STATES.POSITION || currentSimState >= SIM_STATES.WELDING; // Movimiento horizontal (A/W/S/D)
        const canMoveV = currentSimState === SIM_STATES.DISTANCE || currentSimState >= SIM_STATES.WELDING; // Movimiento vertical (Q/E)

        // Izquierda / Derecha (A/D) / Adelante / Atrás (W/S)
        if (canMoveH) {
            // Teclado
            if (keysPressed['a']) toolOffset.x -= moveSpeed * deltaTime;
            if (keysPressed['d']) toolOffset.x += moveSpeed * deltaTime;
            if (keysPressed['w']) toolOffset.z -= moveSpeed * deltaTime;
            if (keysPressed['s']) toolOffset.z += moveSpeed * deltaTime;

            // Móvil Proporcional (Mueve en eje X lateralmente)
            if (isMobileDevice) {
                toolOffset.x += mobileDisplacement * moveSpeed * deltaTime;
            }
        }
        
        // Arriba / Abajo (Q/E)
        if (canMoveV) {
            // Sensibilidad reducida para el paso de SEPARACIÓN
            const sensitivity = currentSimState === SIM_STATES.DISTANCE ? 0.2 : 1.0;
            const stepMoveSpeed = moveSpeed * sensitivity;

            // Teclado
            if (keysPressed['q']) toolOffset.y += stepMoveSpeed * deltaTime;
            if (keysPressed['e']) toolOffset.y -= stepMoveSpeed * deltaTime;

            // Móvil Proporcional (Mueve en eje Y verticalmente)
            if (isMobileDevice) {
                toolOffset.y += mobileDisplacement * stepMoveSpeed * deltaTime;
            }
        }

        // Rotación (Intercambio de ejes: C/V para Longitudinal, Z/X para Lateral)
        if (canRotate) {
            // Paso: ÁNGULO DE AVANCE (C/V - Longitudinal - Eje Z)
            const isAvance = currentSimState === SIM_STATES.AVANCE || currentSimState >= SIM_STATES.WELDING;
            if (isAvance) {
                if (keysPressed['c']) toolRotation.z += rotationSpeed * deltaTime;
                if (keysPressed['v']) toolRotation.z -= rotationSpeed * deltaTime;
                
                // Móvil Proporcional
                if (isMobileDevice) {
                    toolRotation.z += mobileDisplacement * rotationSpeed * deltaTime;
                }
            }
            
            // Paso: ÁNGULO DE TRABAJO (Z/X - Lateral - Eje X)
            const isTrabajo = currentSimState === SIM_STATES.TRABAJO || currentSimState >= SIM_STATES.WELDING;
            if (isTrabajo) {
                if (keysPressed['z']) toolRotation.x += rotationSpeed * deltaTime;
                if (keysPressed['x']) toolRotation.x -= rotationSpeed * deltaTime;

                // Móvil Proporcional
                if (isMobileDevice) {
                    toolRotation.x += mobileDisplacement * rotationSpeed * deltaTime;
                }
            }
        }

        // --- LÍMITES DE ROTACIÓN ...

        // --- LÍMITES DE ROTACIÓN (PREVENCIÓN DE COLISIONES) ---
        const maxTilt = Math.PI * 0.45; // 81 grados aprox (evitar estar totalmente plano)
        
        // 1. Límites generales (no atravesar la mesa/placa base)
        toolRotation.x = Math.max(-maxTilt, Math.min(maxTilt, toolRotation.x));
        // Límite Paso 2: No pasar de 90 grados (vertical) en Ángulo de Avance
        toolRotation.z = Math.max(-maxTilt, Math.min(0, toolRotation.z)); 
        

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
        
        // Validación Paso 1: Posicionamiento inicial
        if (currentSimState === SIM_STATES.POSITION) {
            const marker = scene.getObjectByName("start-marker");
            if (marker) {
                // Efecto de RESPIRACIÓN en el marcador
                const breathe = 1.0 + Math.sin(currentTime * 0.005) * 0.2;
                marker.scale.set(breathe, breathe, 1);
                
                const markerPos = new THREE.Vector3();
                marker.getWorldPosition(markerPos);
                const distH = new THREE.Vector2(worldTip.x, worldTip.z).distanceTo(new THREE.Vector2(markerPos.x, markerPos.z));
                
                if (distH < 0.08) {
                    if (ui.btnNextStep.style.display === 'none') {
                        ui.btnNextStep.style.display = 'block';
                        ui.instrDesc.innerHTML = "<b>¡Punto encontrado!</b> Haz clic para continuar.";
                    }
                    if (angleLabel) {
                        angleLabel.visible = true;
                        // Posición a la izquierda (-X) y un poco elevado (+Y)
                        angleLabel.position.copy(worldTip).add(new THREE.Vector3(-0.35, 0.25, 0));
                        // Aplicar el mismo efecto de respiración que al marcador
                        const labelBreathe = 0.6 * breathe; 
                        angleLabel.scale.set(labelBreathe, labelBreathe * 0.25, 1);
                        angleLabel.quaternion.copy(camera.quaternion);
                    }
                } else {
                    if (ui.btnNextStep.style.display === 'block') {
                        ui.btnNextStep.style.display = 'none';
                        ui.instrDesc.innerHTML = ui.instrDesc.dataset.base;
                    }
                    if (angleLabel) angleLabel.visible = false;
                }
            }
        }

        // Soldadura activa solo en estado WELDING y con botón presionado
        const canWeld = currentSimState === SIM_STATES.WELDING && isWeldButtonPressed && isTouching;
        isWelding = canWeld; // Actualizar flag global para efectos visuales

        if (canWeld) {
            // 1. EFECTOS DE ARCO
            if (arcLight) {
                arcLight.intensity = 5 + Math.random() * 5;
                arcLight.color.setHSL(0.55, 1, 0.5 + Math.random() * 0.5);
            }
            if (arcGlare) {
                arcGlare.visible = true;
                arcGlare.scale.set(0.2 + Math.random() * 0.2, 0.2 + Math.random() * 0.2, 1);
            }

            // 2. CONSUMO DE ELECTRODO
            const consumeAmount = consumptionRate * deltaTime;
            electrodeCurrentHeight -= consumeAmount;
            if (electrodeCurrentHeight < 0.2) electrodeCurrentHeight = 0.2;

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
                        const lctx = distLabel.material.map.image.getContext('2d');
                        lctx.clearRect(0, 0, 512, 160);
                        lctx.font = 'Black 130px Orbitron, Arial'; // Massive font
                        lctx.fillStyle = `#${new THREE.Color(cotaColor).getHexString()}`;
                        lctx.strokeStyle = '#000000';
                        lctx.lineWidth = 8;
                        const text = isPerfect ? "3 mm Perfecto" : `${distMm} mm`;
                        lctx.strokeText(text, 256, 110);
                        lctx.fillText(text, 256, 110);
                        distLabel.material.map.needsUpdate = true;
                        
                        // Sprite siempre mira a cámara
                        distLabel.quaternion.copy(camera.quaternion);
                        
                        // Aplicar rotación adicional de 90º en Z (local) para que el texto sea vertical
                        const qZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
                        distLabel.quaternion.multiply(qZ);
                        
                        // Centrado dinámico en la mitad de la separación
                        distLabel.position.set(0.18, -0.5, 0); // -0.5 es el centro de la línea que va de 0 a -1 (escalada por heightVal)

                        // Update line colors
                        distanceIndicator.children.forEach(c => {
                            if (c.isMesh) c.material.color.setHex(cotaColor);
                        });
                    }
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
                        // Paso 2: ÁNGULO DE AVANCE
                        idealAngle = 0.2618; // 15 grados exactos
                        electrodeRot = currentTool.rotation.z; 
                        currentAngle = Math.abs(electrodeRot);

                        // RESTRICCIÓN: Solo mostrar cota si inclina a la DERECHA del electrodo (negativo en Z)
                        // Si inclina a la izquierda (> 0), ocultamos el indicador
                        if (electrodeRot > 0) {
                            angleIndicator.visible = false;
                            if (angleLabel) angleLabel.visible = false;
                        }
                    }
    
                    if (angleIndicator.visible) {
                        const diff = Math.abs(currentAngle - idealAngle);
                        const isPerfectAngle = diff < 0.05; // ~3 grados de tolerancia
                        
                        // Lógica de HUD dinámico para Ángulos
                        if (isPerfectAngle) {
                            if (ui.btnNextStep.style.display === 'none') {
                                ui.btnNextStep.style.display = 'block';
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
                        
                        const rotSign = Math.sign(electrodeRot) || -1; // -1 por defecto (lado derecho)
                        const sideMultiplier = -rotSign; // Invertir para que coincida con el eje visual
                        
                        // Reposicionar barra de la chapa dinámicamente
                        if (refLinePlate) {
                            refLinePlate.position.x = 0.35 * sideMultiplier;
                        }

                        // El ángulo visual del arco es desde la horizontal (0) hasta el electrodo
                        const angleFromPlate = Math.PI/2 - Math.abs(electrodeRot);
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
                            const labelRadius = 0.55; // Radio ligeramente mayor que el arco (0.4)
                            
                            // Vector local relativo al pivote de la cota
                            const lx = Math.cos(midAngle) * labelRadius * sideMultiplier;
                            const ly = Math.sin(midAngle) * labelRadius;
                            const localPos = new THREE.Vector3(lx, ly, 0);
                            
                            // Aplicar la rotación actual de la cota para que el label siga el movimiento
                            localPos.applyQuaternion(angleIndicator.quaternion);
                            
                            angleLabel.position.copy(worldTip).add(localPos);
                            angleLabel.scale.set(0.6, 0.15, 1);
                            angleLabel.quaternion.copy(camera.quaternion);

                            // El texto muestra el ángulo respectivo a la chapa
                            const displayDegrees = (angleFromPlate * 180 / Math.PI).toFixed(1);
                            const labelCtx = angleLabel.material.map.image.getContext('2d');
                            labelCtx.clearRect(0,0,256,64);
                            labelCtx.fillStyle = `#${indicatorColor.getHexString()}`;
                            labelCtx.textAlign = 'center';
                            labelCtx.font = 'Bold 44px Inter, Arial';
                            labelCtx.fillText(`${displayDegrees}°`, 128, 45);
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

        // Suavizado de cámara (Glide logic)
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
