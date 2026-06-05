const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');
const os = require('os');

// Colores de consola simplificados
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Función para ejecutar comandos de forma segura
function runCmd(command, options = {}) {
  try {
    return execSync(command, { stdio: 'pipe', encoding: 'utf-8', ...options }).trim();
  } catch (error) {
    return null;
  }
}

// Obtener detalles del último release de Engram en GitHub
function fetchLatestEngramRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/Gentleman-Programming/engram/releases/latest',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AntigravitySetupScript'
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub API retornó código ${res.statusCode}`));
            return;
          }
          const release = JSON.parse(data);
          resolve(release);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  log('======================================================', colors.cyan);
  log('   Instalador y Configuración de Ferretería El Serrucho', colors.cyan + colors.bright);
  log('======================================================', colors.cyan);
  log('Este script preparará tu PC para correr el Agente de WhatsApp.', colors.gray);
  log('');

  // 1. Verificar Sistema Operativo
  if (process.platform !== 'win32') {
    log('⚠️ Este instalador automatizado está diseñado para Windows.', colors.yellow);
    const continueOS = await question('¿Deseas continuar de todos modos? (s/n): ');
    if (continueOS.toLowerCase() !== 's') {
      log('Instalación cancelada.', colors.red);
      process.exit(0);
    }
  }

  // 2. Comprobar Node.js (ya está corriendo, pero validamos la versión)
  log('\n[1/5] Verificando Node.js...', colors.cyan);
  log(` -> Node.js versión detectada: ${process.version}`, colors.green);

  // 3. Comprobar Git
  log('\n[2/5] Verificando Git...', colors.cyan);
  const gitVersion = runCmd('git --version');
  if (gitVersion) {
    log(` -> Git instalado: ${gitVersion}`, colors.green);
  } else {
    log('❌ Git no está instalado o no está en el PATH.', colors.red);
    const installGit = await question('¿Deseas instalar Git automáticamente con winget? (s/n): ');
    if (installGit.toLowerCase() === 's') {
      log('Instalando Git mediante winget...', colors.gray);
      try {
        execSync('winget install --id Git.Git -e --source winget --accept-source-agreements --accept-package-agreements', { stdio: 'inherit' });
        log(' -> Git instalado con éxito. Por favor, reinicia esta consola tras finalizar todo.', colors.green);
      } catch (e) {
        log('❌ Error al instalar Git. Por favor, instálalo manualmente desde https://git-scm.com/', colors.red);
      }
    } else {
      log('⚠️ Por favor instala Git manualmente antes de continuar.', colors.yellow);
    }
  }

  // 4. Comprobar Docker y Docker Compose
  log('\n[3/5] Verificando Docker...', colors.cyan);
  const dockerVersion = runCmd('docker --version');
  const dockerComposeVersion = runCmd('docker compose version') || runCmd('docker-compose --version');

  if (dockerVersion && dockerComposeVersion) {
    log(` -> Docker instalado: ${dockerVersion}`, colors.green);
    log(` -> Docker Compose instalado: ${dockerComposeVersion}`, colors.green);
  } else {
    log('❌ Docker Desktop o Docker Compose no están instalados.', colors.red);
    const installDocker = await question('¿Deseas instalar Docker Desktop con winget? (s/n): ');
    if (installDocker.toLowerCase() === 's') {
      log('Instalando Docker Desktop...', colors.gray);
      try {
        execSync('winget install --id Docker.DockerDesktop -e --source winget --accept-source-agreements --accept-package-agreements', { stdio: 'inherit' });
        log(' -> Docker Desktop instalado con éxito. Requerirá reiniciar la PC.', colors.green);
      } catch (e) {
        log('❌ Error al instalar Docker. Instálalo desde https://www.docker.com/products/docker-desktop/', colors.red);
      }
    } else {
      log('⚠️ Asegúrate de instalar Docker Desktop manualmente para poder levantar WAHA y n8n.', colors.yellow);
    }
  }

  // 5. Comprobar Engram (Servidor de Memorias)
  log('\n[4/5] Verificando Servidor de Memorias Engram...', colors.cyan);
  const engramVersion = runCmd('engram version') || runCmd('engram --version');
  
  if (engramVersion) {
    log(` -> Engram instalado: ${engramVersion}`, colors.green);
  } else {
    log('❌ Engram no está instalado en el PATH.', colors.red);
    const installEngram = await question('¿Deseas descargar e instalar Engram automáticamente? (s/n): ');
    
    if (installEngram.toLowerCase() === 's') {
      log('Buscando el último binario de Engram en GitHub...', colors.gray);
      try {
        const release = await fetchLatestEngramRelease();
        const asset = release.assets.find(a => a.name.includes('windows') && a.name.includes('amd64') && a.name.endsWith('.zip'));
        
        if (!asset) {
          throw new Error('No se encontró un binario zip de Windows x64 en la última versión de GitHub.');
        }

        const downloadUrl = asset.browser_download_url;
        const zipName = asset.name;
        const installDir = path.join(os.homedir(), '.engram', 'bin');
        const zipPath = path.join(os.tmpdir(), zipName);

        log(` -> Descargando Engram v${release.name || release.tag_name}...`, colors.gray);
        
        // Descargar usando curl (nativo en Win10/11) para soportar redireccionamientos
        execSync(`curl -L -o "${zipPath}" "${downloadUrl}"`, { stdio: 'inherit' });

        log(` -> Creando directorio de instalación en ${installDir}...`, colors.gray);
        if (!fs.existsSync(installDir)) {
          fs.mkdirSync(installDir, { recursive: true });
        }

        log(' -> Extrayendo binario...', colors.gray);
        // Descomprimir usando PowerShell nativo
        execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${installDir}' -Force"`, { stdio: 'inherit' });

        // Verificar que el exe existe y renombrarlo/moverlo si está dentro de una subcarpeta
        let binPath = path.join(installDir, 'engram.exe');
        if (!fs.existsSync(binPath)) {
          // A veces los zips contienen una carpeta intermedia. Buscamos el exe.
          const files = fs.readdirSync(installDir);
          const exeFile = files.find(f => f.endsWith('.exe'));
          if (exeFile) {
            binPath = path.join(installDir, exeFile);
          } else {
            // Buscar recursivamente o buscar en subcarpetas
            const subdirs = files.filter(f => fs.statSync(path.join(installDir, f)).isDirectory());
            for (const subdir of subdirs) {
              const subfiles = fs.readdirSync(path.join(installDir, subdir));
              const subexe = subfiles.find(sf => sf.endsWith('.exe'));
              if (subexe) {
                fs.copyFileSync(path.join(installDir, subdir, subexe), path.join(installDir, 'engram.exe'));
                binPath = path.join(installDir, 'engram.exe');
                break;
              }
            }
          }
        }

        log(' -> Agregando Engram al PATH de usuario en Windows...', colors.gray);
        execSync(`powershell -Command "[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ';${installDir}', 'User')"`);
        
        // Agregar temporalmente al PATH actual del proceso
        process.env.PATH = `${process.env.PATH};${installDir}`;

        log(' -> Engram instalado exitosamente en ' + installDir, colors.green);
        log('💡 Nota: Para que la consola reconozca el comando "engram" de forma global, abre una nueva terminal.', colors.yellow);
        
        // Eliminar zip temporal
        try { fs.unlinkSync(zipPath); } catch (e) {}

      } catch (e) {
        log(`❌ Error al instalar Engram: ${e.message}`, colors.red);
        log('Por favor instálalo manualmente siguiendo las instrucciones en: https://github.com/Gentleman-Programming/engram', colors.yellow);
      }
    } else {
      log('⚠️ Deberás instalar Engram manualmente para usar la persistencia de memoria.', colors.yellow);
    }
  }

  // 6. Configurar Archivo .env
  log('\n[5/5] Configurando variables de entorno...', colors.cyan);
  const envPath = path.join(__dirname, '.env');
  const envExamplePath = path.join(__dirname, '.env.example');

  if (!fs.existsSync(envPath)) {
    log(' -> Creando archivo .env desde plantilla .env.example...', colors.gray);
    fs.copyFileSync(envExamplePath, envPath);
  }

  // Leer y permitir configuración rápida
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  log('Configuración de credenciales de n8n:', colors.gray);
  const n8nApiKey = await question('Ingresa tu N8N_API_KEY (presiona Enter para mantener la actual/ejemplo): ');
  
  if (n8nApiKey.trim()) {
    envContent = envContent.replace(/N8N_API_KEY=.*/, `N8N_API_KEY=${n8nApiKey.trim()}`);
    fs.writeFileSync(envPath, envContent, 'utf8');
    log(' -> N8N_API_KEY actualizada en .env.', colors.green);
  }

  log('\n======================================================', colors.cyan);
  log('   Puesta en Marcha del Sistema', colors.cyan + colors.bright);
  log('======================================================', colors.cyan);

  // Verificar estado del Docker Daemon
  const isDockerRunning = runCmd('docker info');
  if (!isDockerRunning) {
    log('⚠️ El servicio de Docker no está corriendo.', colors.yellow);
    log('Asegúrate de iniciar Docker Desktop en tu PC.', colors.yellow);
  } else {
    log('✅ Docker Daemon activo.', colors.green);
    const startDocker = await question('¿Deseas levantar la pila Docker (n8n + WAHA) ahora mismo? (s/n): ');
    if (startDocker.toLowerCase() === 's') {
      try {
        // Asegurar que el volumen externo n8n_data exista antes de levantar compose
        const volumeCheck = runCmd('docker volume inspect n8n_data');
        if (!volumeCheck) {
          log(' -> Creando volumen de Docker externo "n8n_data"...', colors.gray);
          runCmd('docker volume create n8n_data');
        }
      } catch (e) {
        runCmd('docker volume create n8n_data');
      }

      log('Levantando contenedores con docker-compose...', colors.gray);
      try {
        const composeCmd = runCmd('docker compose version') ? 'docker compose' : 'docker-compose';
        execSync(`${composeCmd} up -d --build`, { stdio: 'inherit' });
        log('✅ Contenedores levantados con éxito.', colors.green);
        
        log('⌛ Esperando a que n8n se inicie para importar el flujo automáticamente (15 segundos)...', colors.gray);
        await new Promise(resolve => setTimeout(resolve, 15000));
        log('📥 Importando el flujo de n8n desde la CLI del contenedor...', colors.gray);
        try {
          execSync('docker exec n8n_serrucho n8n import:workflow --input=/etc/n8n/n8n_workflow.json', { stdio: 'inherit' });
          log('✅ Flujo de n8n importado exitosamente de manera automática.', colors.green);
        } catch (importErr) {
          log('⚠️ No se pudo importar el flujo automáticamente. Podrás importarlo manualmente desde la interfaz web de n8n.', colors.yellow);
        }
      } catch (e) {
        log('❌ Error al levantar Docker Compose. Verifica la consola.', colors.red);
      }
    }
  }

  log('\n🎉 ¡Configuración completada!', colors.green + colors.bright);
  log('\nPasos siguientes recomendados para iniciar:', colors.bright);
  log('1. Importa el esquema de base de datos en Supabase usando el archivo:', colors.gray);
  log('   supabase_schema.sql', colors.cyan);
  log('2. Accede al panel de control de WAHA en http://localhost:3000 para escanear el código QR y conectar tu celular.', colors.gray);
  log('3. Accede a n8n en http://localhost:5678 e importa el flujo desde n8n_workflow.json.', colors.gray);
  log('4. Para iniciar el bot y el servidor de memorias local, ejecuta en PowerShell:', colors.gray);
  log('   npm start   o   .\\start_agent.ps1', colors.cyan);
  log('');

  rl.close();
}

main().catch(err => {
  log(`\n❌ Ocurrió un error inesperado durante la instalación: ${err.message}`, colors.red);
  rl.close();
});
