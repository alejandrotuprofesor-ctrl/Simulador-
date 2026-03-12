// main.js - Standard Script Version
let scene, camera, renderer, controls;
let currentQuestionIndex = 0;
let userChoices = [];
let questionHistory = [];
let ui = {};

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
    initUI();
    init();
    animate();
});

function initUI() {
    ui = {
        welcomeScreen: document.getElementById('welcome-screen'),
        questionScreen: document.getElementById('question-screen'),
        resultScreen: document.getElementById('result-screen'),
        btnStart: document.getElementById('btn-start'),
        btnBack: document.getElementById('btn-back'),
        btnRestart: document.getElementById('btn-restart'),
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
        btnStartWeld: document.getElementById('btn-start-weld')
    };

    console.log("UI Elements mapped:", Object.keys(ui).filter(k => ui[k] !== null));

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

    if (ui.btnNextStep) ui.btnNextStep.addEventListener('click', nextSimStep);
    
    if (ui.btnStartWeld) {
        ui.btnStartWeld.addEventListener('mousedown', () => isWeldButtonPressed = true);
        ui.btnStartWeld.addEventListener('mouseup', () => isWeldButtonPressed = false);
        ui.btnStartWeld.addEventListener('touchstart', () => isWeldButtonPressed = true, {passive: false});
        ui.btnStartWeld.addEventListener('touchend', () => isWeldButtonPressed = false);
    }
}

function nextSimStep() {
    if (currentSimState === SIM_STATES.START) setSimState(SIM_STATES.ANGLE);
    else if (currentSimState === SIM_STATES.ANGLE) setSimState(SIM_STATES.POSITION);
    else if (currentSimState === SIM_STATES.POSITION) setSimState(SIM_STATES.READY);
    else if (currentSimState === SIM_STATES.READY) setSimState(SIM_STATES.WELDING);
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

    switch(newState) {
        case SIM_STATES.START:
            ui.instrTitle.textContent = "INICIO";
            ui.instrDesc.innerHTML = "<b>Selecciona los parámetros</b>";
            ui.btnNextStep.style.display = 'block';
            ui.btnNextStep.textContent = "CONFIGURAR ÁNGULO";
            ui.btnStartWeld.style.display = 'none';
            // Vista libre inicial (más alejada para ver todo)
            targetCamPos.set(4, 3, 4);
            targetLookAt.set(0, 0, 0);
            break;

        case SIM_STATES.ANGLE:
            ui.instrTitle.textContent = "Paso 1: Ángulo de Trabajo";
            ui.instrDesc.innerHTML = "Ajusta la inclinación con <b>Z</b> y <b>X</b> hasta que el indicador esté en verde.";
            ui.btnNextStep.style.display = 'block';
            ui.btnNextStep.textContent = "SIGUIENTE PASO";
            ui.btnStartWeld.style.display = 'none';
            // Vista frontal (desde el lateral de la mesa)
            targetCamPos.set(0, 0.7, 2.0); 
            targetLookAt.set(0, 0.1, 0);
            break;

        case SIM_STATES.POSITION:
            ui.instrTitle.textContent = "Paso 2: Posicionamiento";
            ui.instrDesc.innerHTML = "Usa <b>A, W, S, D</b> para llevar la punta al inicio del cordón.";
            ui.btnNextStep.style.display = 'block';
            ui.btnNextStep.textContent = "SIGUIENTE PASO";
            ui.btnStartWeld.style.display = 'none';
            // Vista isométrica superior
            targetCamPos.set(1.5, 1.2, 1.5);
            targetLookAt.set(0, 0.1, 0);
            break;

        case SIM_STATES.READY:
            ui.instrTitle.textContent = "Paso 3: ¡Listo!";
            ui.instrDesc.textContent = "Asegúrate de que la punta toque ligeramente la pieza.";
            ui.btnNextStep.style.display = 'none';
            ui.btnStartWeld.style.display = 'block';
            ui.btnStartWeld.textContent = "EMPEZAR A SOLDAR";
            break;

        case SIM_STATES.WELDING:
            ui.instrTitle.textContent = "Simulación en Curso";
            ui.instrDesc.textContent = "Mantén presionado para generar el arco.";
            ui.btnNextStep.style.display = 'none';
            ui.btnStartWeld.style.display = 'block';
            ui.btnStartWeld.textContent = "TERMINAR";
            break;
    }
    if (controls) controls.update();
}

// Estados de Simulación
const SIM_STATES = { START: -1, ANGLE: 0, POSITION: 1, READY: 2, WELDING: 3 };
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

    // Entorno para reflejos desactivado a petición del usuario
    // const pmremGenerator = new THREE.PMREMGenerator(renderer);
    // pmremGenerator.compileEquirectangularShader();
    // scene.environment = pmremGenerator.fromScene(new THREE.Scene()).texture; 

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
    ui.visualSummary.className = 'options-grid'; 
    
    // Ocultar título para ahorrar espacio en HUD superior
    const resTitle = ui.resultScreen.querySelector('h2');
    if (resTitle) resTitle.style.display = 'none';

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
    if (oldPiece) scene.remove(oldPiece);
    if (oldTool) scene.remove(oldTool);
    if (oldBeads) scene.remove(oldBeads);
    
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
    let colorHex = '#777777';
    let metalness = 0; // Mate total
    let roughness = 1; // Rugosidad máxima

    if (materialChoice === 'inox') { colorHex = '#c0c0c5'; }
    else if (materialChoice === 'aluminio') { colorHex = '#b0b0b0'; }
    else if (materialChoice === 'acero_carbono') { colorHex = '#333333'; }

    mctx.fillStyle = colorHex;
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
        color: new THREE.Color(colorHex), 
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
    
    // 475: --- INDICADORES ---
    // 1. Línea de Ángulo (Cota - Grupo para Rotación Dinámica)
    angleIndicator = new THREE.Group();
    
    const angleLineMat = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 });
    
    // Arco (90 grados) en plano XY para vista frontal
    const anglePoints = [];
    for(let i=0; i<=30; i++) {
        const a = (i/30) * Math.PI/2;
        anglePoints.push(new THREE.Vector3(Math.cos(a)*0.4, Math.sin(a)*0.4, 0));
    }
    const angleLineGeom = new THREE.BufferGeometry().setFromPoints(anglePoints);
    const arcLine = new THREE.Line(angleLineGeom, angleLineMat);
    angleIndicator.add(arcLine);
    
    // Líneas de referencia (Cotas) en plano XY
    const refLineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0.5,0,0)]);
    const refLinePiece = new THREE.Line(refLineGeom, angleLineMat);
    angleIndicator.add(refLinePiece);
    
    const refLineElectrode = new THREE.Line(refLineGeom, angleLineMat);
    angleIndicator.add(refLineElectrode);
    
    // Puntas de flecha (Tangenciales - rotadas 90º en Z sobre la base anterior)
    const arrowGeom = new THREE.ConeGeometry(0.015, 0.04, 8);
    
    const arrow1 = new THREE.Mesh(arrowGeom, angleLineMat);
    arrow1.position.set(0.4, 0, 0); 
    // Apunta hacia arriba (Eje Y) para ser tangente al inicio del arco en X=0.4
    arrow1.rotation.z = 0; 
    angleIndicator.add(arrow1);
    
    const arrow2 = new THREE.Mesh(arrowGeom, angleLineMat);
    arrow2.position.set(0, 0.4, 0);
    // Apunta hacia la izquierda (-X) para ser tangente al final del arco en Y=0.4
    arrow2.rotation.z = Math.PI / 2; 
    angleIndicator.add(arrow2);
    
    angleIndicator.userData.refLineElectrode = refLineElectrode;
    scene.add(angleIndicator);

    // 2. Etiqueta de Texto (Canvas Texture)
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256; labelCanvas.height = 64;
    const lctx = labelCanvas.getContext('2d');
    lctx.font = 'Bold 40px Inter, Arial';
    lctx.textAlign = 'center';
    lctx.fillStyle = 'white';
    lctx.fillText('Perfecto', 128, 45);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
    angleLabel = new THREE.Sprite(labelMat);
    angleLabel.scale.set(0.5, 0.125, 1);
    angleLabel.visible = false;
    scene.add(angleLabel);

    // 3. Guía de Distancia
    const distGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,-1,0)]);
    const distMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.05, gapSize: 0.03 });
    distanceIndicator = new THREE.Line(distGeom, distMat);
    distanceIndicator.computeLineDistances();
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
        const canRotate = currentSimState === SIM_STATES.ANGLE || currentSimState >= SIM_STATES.WELDING;
        const canMove = currentSimState >= SIM_STATES.POSITION;

        // Izquierda / Derecha (A/D) -> Eje X
        if (canMove) {
            if (keysPressed['a']) toolOffset.x -= moveSpeed * deltaTime;
            if (keysPressed['d']) toolOffset.x += moveSpeed * deltaTime;
            if (keysPressed['w']) toolOffset.z -= moveSpeed * deltaTime;
            if (keysPressed['s']) toolOffset.z += moveSpeed * deltaTime;
            if (keysPressed['q']) toolOffset.y += moveSpeed * deltaTime;
            if (keysPressed['e']) toolOffset.y -= moveSpeed * deltaTime;
        }

        // Rotación (Z/X para eje Z - Trabajo, C/V para eje X - Avance)
        if (canRotate) {
            // Ajustar el ángulo de TRABAJO (Z y X) - Ahora rota sobre el eje Z (lateral)
            if (keysPressed['z']) toolRotation.z += rotationSpeed * deltaTime;
            if (keysPressed['x']) toolRotation.z -= rotationSpeed * deltaTime;
            
            // Ajustar el ángulo de AVANCE (C y V) - Ahora rota sobre el eje X (longitudinal)
            if (currentSimState !== SIM_STATES.ANGLE) {
                if (keysPressed['c']) toolRotation.x += rotationSpeed * deltaTime;
                if (keysPressed['v']) toolRotation.x -= rotationSpeed * deltaTime;
            }
        }

        // --- LÍMITES DE ROTACIÓN ...

        // --- LÍMITES DE ROTACIÓN (PREVENCIÓN DE COLISIONES) ---
        const maxTilt = Math.PI * 0.45; // 81 grados aprox (evitar estar totalmente plano)
        
        // 1. Límites generales (no atravesar la mesa/placa base)
        toolRotation.x = Math.max(-maxTilt, Math.min(maxTilt, toolRotation.x));
        toolRotation.z = Math.max(-maxTilt, Math.min(maxTilt, toolRotation.z));

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
                    const showIndicators = currentSimState !== SIM_STATES.START;
                    
                    distanceIndicator.visible = !isTouching && showIndicators;
                    distanceIndicator.position.copy(worldTip);
                    distanceIndicator.scale.y = Math.max(0.001, distToSurface);
                    
                angleIndicator.visible = showIndicators;
                angleIndicator.position.copy(worldTip);
                
                // Rotar el grupo del indicador para que esté en el plano XY (frontal)
                angleIndicator.rotation.y = 0; 

                const idealWorkAngleNormalized = isT ? Math.PI / 4 : 0; 
                const currentWorkAngle = Math.abs(currentTool.rotation.z); // Usamos rotación Z (lateral)
                const diff = Math.abs(currentWorkAngle - idealWorkAngleNormalized);
                const errorFactor = Math.min(1, diff / 0.5);
                
                // Actualizar colores
                const indicatorColor = new THREE.Color().setRGB(errorFactor, 1 - errorFactor, 0);
                angleIndicator.children.forEach(child => {
                    if (child.material) child.material.color.copy(indicatorColor);
                });

                // Rotar línea de referencia del electrodo y punta de flecha 2 (tangente)
                const electrodeRot = currentTool.rotation.z;
                // Rotamos 90 grados (PI/2) para que el ángulo 0 del indicador sea vertical
                const indicatorAngle = electrodeRot + Math.PI/2; 
                if (angleIndicator.userData.refLineElectrode) {
                    angleIndicator.userData.refLineElectrode.rotation.z = indicatorAngle;
                }
                if (angleIndicator.children[4]) {
                    const arrowX = Math.cos(indicatorAngle) * 0.4;
                    const arrowY = Math.sin(indicatorAngle) * 0.4;
                    angleIndicator.children[4].position.set(arrowX, arrowY, 0);
                    angleIndicator.children[4].rotation.z = indicatorAngle + Math.PI/2; 
                }

                if (angleLabel) {
                    if (diff < 0.05) { 
                        angleLabel.visible = true;
                        angleLabel.position.copy(worldTip).add(new THREE.Vector3(0.05, 0.3, 0));
                        angleLabel.quaternion.copy(camera.quaternion);
                    } else {
                        angleLabel.visible = false;
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
    }

    // Suavizado de cámara
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

        if (controls) controls.update();
        if (renderer && scene && camera) renderer.render(scene, camera);
    } catch (err) {
        console.warn("Animation Loop Error:", err);
    }
}
