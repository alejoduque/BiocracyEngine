    // MAQUINA:INICIO ── Performance del domo · solo con PERFORMANCE=1 (lo pone lanzador.py)
    // Lo inserta instalar.py justo antes de «// Final system check». No editar a mano.
    if("PERFORMANCE".getenv == "1") {
        [
            "web/performance_domo/22_voz_maquina.scd",   // voz de la máquina y voto de dos llaves
            "web/performance_domo/23_rutina.scd"         // partitura de 30 minutos
        ].do { |file|
            var path = basePath +/+ file;
            if(File.exists(path)) {
                ("Loading " ++ file ++ "...").postln; path.load; 2.wait;
            } { ("File not found: " ++ path).warn };
        };
    };
    // MAQUINA:FIN
