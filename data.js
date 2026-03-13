const questionsData = [
    { 
        id: "q2_joint", 
        title: "Tipo de Unión", 
        subtitle: "Configuración de las piezas", 
        options: [
            { id: "tope", label: "Unión a Tope", description: "Alineados en el mismo plano.", imgSrc: "assets/Aluminio.jpg", value: "tope" }, 
            { id: "en_t", label: "En T", description: "Piezas perpendiculares.", imgSrc: "assets/En T.jpg", value: "en_t" }
        ] 
    },
    { 
        id: "q6_process", 
        title: "Proceso de Soldadura", 
        subtitle: "Método a emplear", 
        options: [
            { id: "smaw", label: "Electrodo Revestido (SMAW)", description: "Manual manual.", imgSrc: "assets/SMAW 111.jpg", value: "smaw" }, 
            { id: "gmaw", label: "MIG/MAG (GMAW)", description: "Hilo continuo.", imgSrc: "assets/GMAWFCAW 13.jpg", value: "gmaw" }, 
            { id: "gtaw", label: "TIG (GTAW)", description: "Alta precisión.", imgSrc: "assets/GTAW 141.jpg", value: "gtaw" }
        ] 
    }
];
