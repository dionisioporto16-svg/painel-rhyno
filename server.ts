import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import * as fs from "fs";
import Fuse from "fuse.js";
import { format } from "date-fns";
import cors from "cors";
import multer from "multer";

// Fix for XLSX in ESM
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const xlsx = require("xlsx");
const { readFile, utils, SSF } = xlsx;

// Configuração das Operações (Cidades e Motoristas Chave)
const OPERACOES: Record<string, string[]> = {
  "SANTA FÉ DO SUL": ["domingos neto", "domingos ferrantes", "rogerio molina", "rogerio"],
  "ARARAQUARA": ["alexandra luzia", "kelly cristina", "valquiria da silva", "carlos alberto"],
  "EMBU GUAÇU": ["edvaldo nunes", "adison ferreira"],
  "RIO CLARO": ["jose de claudio", "paulo cesar", "osmar de souza", "ubirajara"],
  "SIMONSEN": ["devani alves", "adriana da silva", "joao delcino"],
  "SANTA ADÉLIA": ["renato nunes", "pedro oscar", "jamil mattioli", "warley durante"],
  "SÃO JOSÉ DO RIO PRETO": ["simone regina", "grace carryne", "antonio fabio", "fabio alex", "simone"],
  "CHAPADÃO DO SUL": ["luciano", "antonio reinaldo", "antonio reinado", "robson arnaldo"],
  "RONDONÓPOLIS": ["jonh lennon", "jhon lennon", "john lennon", "esmeraldo de jesus", "esmeraldo", "john lenon"],
  "SÃO VICENTE": ["bruno frank", "alberico de souza", "alberico"],
};

const CIDADE_ALIASES: Record<string, string[]> = {
  "SÃO JOSÉ DO RIO PRETO": ["sao jose", "sjrp", "rio preto", "rp", "s.j.r.p", "sp"],
  "RONDONÓPOLIS": ["rondonopolis", "roo", "rondon", "mt", "ro", "rondono", "rondonopolis-mt"],
  "SANTA FÉ DO SUL": ["santa fe", "sfs", "st fe", "sta fe", "santa fe do sul", "santa fe sul"],
  "ARARAQUARA": ["aqa", "araraquara", "ara"],
  "CHAPADÃO DO SUL": ["chapadao", "ms", "chapadão"],
  "SIMONSEN": ["simonsen", "simonsem", "simons"],
};

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Logging middleware for API
app.use("/api", (req, res, next) => {
  console.log(`[API] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const EXCEL_PATH = path.join(DATA_DIR, "escala.xlsx");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, DATA_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, "escala.xlsx");
  },
});

const upload = multer({ storage });

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado" });
  }
  res.json({ message: "Arquivo enviado com sucesso" });
});

const STATUS_ATIVO = ["S", "REDE", "X", "1", "SIM", "OK", "07:00", "7:00", "TRABALHANDO", "ATIVO", "S ", "REDE "];

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseExcelDate(val: any): { day: number; month: number } | null {
  if (!val) return null;
  
  // Se for um número (data serial do Excel)
  if (typeof val === 'number') {
    try {
      const date = SSF.parse_date_code(val);
      return { day: date.d, month: date.m };
    } catch (e) {
      return null;
    }
  }

  const str = String(val).toLowerCase().trim();
  
  // Tenta "10-mar" ou "10/mar" ou "10 mar"
  const monthsMap: Record<string, number> = {
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
    jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
    janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
    julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
  };

  const match = str.match(/(\d{1,2})[\/\-.\s]([a-z]{3,9})/);
  if (match) {
    const day = parseInt(match[1]);
    const monthStr = match[2].substring(0, 3);
    if (monthsMap[monthStr]) {
      return { day, month: monthsMap[monthStr] };
    }
  }

  // Tenta "10/03"
  const matchNum = str.match(/(\d{1,2})[\/\-.](\d{1,2})/);
  if (matchNum) {
    return { day: parseInt(matchNum[1]), month: parseInt(matchNum[2]) };
  }

  // Tenta apenas o dia "10"
  const matchDay = str.match(/^(\d{1,2})$/);
  if (matchDay) {
    return { day: parseInt(matchDay[1]), month: 0 }; // Mês desconhecido
  }

  return null;
}

app.get("/api/sync", async (req, res) => {
  try {
    if (!fs.existsSync(EXCEL_PATH)) {
      return res.status(404).json({ error: "Arquivo escala.xlsx não encontrado no diretório data/" });
    }

    const workbook = readFile(EXCEL_PATH);
    const allAtivos: any[] = [];
    
    // Pegar data do query param ou usar hoje (ajustado para UTC-3 se for o caso)
    const queryDay = req.query.day ? parseInt(req.query.day as string) : null;
    const queryMonth = req.query.month ? parseInt(req.query.month as string) : null;

    let targetDay: number;
    let targetMonth: number;

    if (queryDay && queryMonth) {
      targetDay = queryDay;
      targetMonth = queryMonth;
    } else {
      // Fallback para UTC-3 (Brasil) se não enviado
      const now = new Date();
      // Usar toLocaleString para garantir o fuso horário correto de Brasília
      const brTimeStr = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
      const brTime = new Date(brTimeStr);
      
      targetDay = brTime.getDate();
      targetMonth = brTime.getMonth() + 1;
      const hour = brTime.getHours();

      // Ajuste de "Madrugada": Se for entre 00:00 e 05:00, 
      // o usuário pode estar procurando a escala do dia anterior (que ainda está em curso)
      // OU a do dia que começou. Vamos logar isso.
      console.log(`Sincronizando para data: ${targetDay}/${targetMonth} às ${hour}h (Horário de Brasília)`);
    }

    console.log(`Buscando escala para o dia ${targetDay}/${targetMonth}`);

    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const data = utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      
      // Identificar se o nome da aba sugere uma cidade
      const sheetNameNormalized = normalizeText(sheetName);
      let sheetCity = "";
      for (const [cidade, aliases] of Object.entries(CIDADE_ALIASES)) {
        if (sheetNameNormalized.includes(normalizeText(cidade)) || aliases.some(a => sheetNameNormalized.includes(a))) {
          sheetCity = cidade;
          break;
        }
      }

      // Encontrar a linha do cabeçalho
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(data.length, 40); i++) {
        const row = data[i];
        if (!row) continue;
        const rowStr = row.join(" ").toLowerCase();
        if (rowStr.includes("colaborador") || rowStr.includes("motorista")) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) return;

      const headers = Array.from(data[headerRowIndex] || []).map(h => String(h || "").toLowerCase().trim());
      let colNome = headers.findIndex(h => h && (h.includes("colaborador") || h.includes("motorista") || h === "nome" || h.includes("nome do")));
      let colCidade = headers.findIndex(h => h && (h.includes("cidade") || h.includes("filial") || h.includes("unidade") || h.includes("operação") || h.includes("operacao")));
      let colUF = headers.findIndex(h => h && (h === "uf" || h === "estado" || h === "est"));
      let colCoord = headers.findIndex(h => h && (h.includes("coordenador") || h.includes("coord") || h.includes("supervisor") || h.includes("gestor") || h.includes("lider")));
      
      // Encontrar a coluna do dia
      let colDia = -1;
      const targetDayStr = targetDay.toString().padStart(2, '0');
      const targetMonthStr = targetMonth.toString().padStart(2, '0');

      for (let j = 0; j < headers.length; j++) {
        const cellVal = data[headerRowIndex][j];
        const dateInfo = parseExcelDate(cellVal);
        
        if (dateInfo && dateInfo.day === targetDay && (dateInfo.month === 0 || dateInfo.month === targetMonth)) {
          colDia = j;
          break;
        }
      }

      // Fallback 1: Tenta na linha de cima
      if (colDia === -1 && headerRowIndex > 0) {
        const rowAbove = data[headerRowIndex - 1];
        for (let j = 0; j < rowAbove.length; j++) {
          const dateInfo = parseExcelDate(rowAbove[j]);
          if (dateInfo && dateInfo.day === targetDay && (dateInfo.month === 0 || dateInfo.month === targetMonth)) {
            colDia = j;
            break;
          }
        }
      }

      // Fallback 2: Busca por texto direto (ex: "11/03", "11-mar", "11 mar")
      if (colDia === -1) {
        const monthsShort = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
        const mesAbrev = monthsShort[targetMonth - 1];
        for (let j = 0; j < headers.length; j++) {
          const hStr = String(headers[j] || "").toLowerCase();
          if (hStr.includes(targetDay.toString())) {
            if (hStr.includes(mesAbrev) || hStr.includes(targetMonthStr) || hStr.includes("/" + targetMonth) || hStr.includes("-" + targetMonth)) {
              colDia = j;
              break;
            }
          }
        }
      }

      if (colDia !== -1) {
        console.log(`Aba ${sheetName}: Coluna do dia ${targetDay}/${targetMonth} encontrada no índice ${colDia}`);
      }

      if (colNome === -1 || colDia === -1) {
        console.log(`Aba ${sheetName}: Colunas não encontradas (Nome: ${colNome}, Dia: ${colDia}, Cidade: ${colCidade})`);
        
        // Se achamos o dia mas não o nome, tenta achar a coluna de nomes por amostragem
        if (colDia !== -1 && colNome === -1) {
           for (let j = 0; j < headers.length; j++) {
             if (j === colDia) continue;
             let countStrings = 0;
             for (let rowIdx = headerRowIndex + 1; rowIdx < Math.min(data.length, headerRowIndex + 15); rowIdx++) {
               const val = data[rowIdx] ? data[rowIdx][j] : null;
               if (val && typeof val === 'string' && val.trim().length > 8) countStrings++;
             }
             if (countStrings >= 3) {
               colNome = j;
               console.log(`Aba ${sheetName}: Fallback ativado! Usando coluna ${j} como Nome.`);
               break;
             }
           }
        }
        
        // Se ainda assim não achou o essencial, pula esta aba
        if (colNome === -1 || colDia === -1) return;
      }

      // Processar motoristas
      let countAba = 0;
      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        const nome = String(row[colNome] || "").trim();
        const status = String(row[colDia] || "").trim().toUpperCase();
        let cidadeRaw = colCidade !== -1 ? String(row[colCidade] || "").trim() : "";
        const ufRaw = colUF !== -1 ? String(row[colUF] || "").trim().toUpperCase() : "";
        const coordenadorRaw = colCoord !== -1 ? String(row[colCoord] || "").trim() : "";

        // Se a cidadeRaw parece um turno (ex: "1T", "3T", "Folguista"), ignoramos e usamos a cidade da aba
        const looksLikeShift = /^\d[º°]?[tT]$/.test(cidadeRaw) || 
                               cidadeRaw.toLowerCase().includes("turno") || 
                               cidadeRaw.toLowerCase().includes("folguista") ||
                               cidadeRaw.toLowerCase().includes("prei");
        
        if ((!cidadeRaw || looksLikeShift) && sheetCity) {
          cidadeRaw = sheetCity;
        }

        // Se ainda assim não temos cidade, mas temos UF, damos um palpite
        if (!cidadeRaw || looksLikeShift) {
          if (ufRaw === "MT") cidadeRaw = "RONDONÓPOLIS";
          if (ufRaw === "SP" && !cidadeRaw) cidadeRaw = "SÃO JOSÉ DO RIO PRETO";
        }

        if (nome && STATUS_ATIVO.includes(status)) {
          allAtivos.push({
            nome: normalizeText(nome),
            nomeOriginal: nome,
            cidadeRaw: normalizeText(cidadeRaw),
            status,
            coordenador: coordenadorRaw
          });
          countAba++;
        }
      }
      console.log(`Aba ${sheetName}: ${countAba} motoristas ativos encontrados.`);
    });

    // Construir o status por operação
    const results = Object.entries(OPERACOES).map(([cidade, nomesChave]) => {
      // Filtrar ativos que pertencem a esta cidade
      const candidatosCidade = allAtivos.filter(a => {
        const normCidade = normalizeText(cidade);
        const normCidadeRaw = normalizeText(a.cidadeRaw || "");
        
        // Match por cidade ou aliases
        const aliases = CIDADE_ALIASES[cidade] || [];
        const matchCidade = normCidadeRaw.includes(normCidade) || 
                           normCidade.includes(normCidadeRaw) ||
                           aliases.some(alias => {
                             const normAlias = normalizeText(alias);
                             return normCidadeRaw.includes(normAlias) || normAlias.includes(normCidadeRaw);
                           });
        
        if (matchCidade) return true;
        
        // Se não tem cidadeRaw, mas o nome do motorista é um dos nomes chave, aceitamos
        if (!a.cidadeRaw || a.cidadeRaw === "") {
          return nomesChave.some(m => a.nome.includes(normalizeText(m)));
        }

        return false;
      });

      // NOVO: Se houver alguém com status REDE na cidade, prioridade total
      const alguemEmRede = candidatosCidade.find(c => c.status.includes("REDE"));
      if (alguemEmRede) {
        return {
          cidade,
          motorista: alguemEmRede.nomeOriginal,
          encontrado: true,
          status: "REDE",
          coordenador: alguemEmRede.coordenador || null
        };
      }

      // Dos candidatos da cidade, quais são os nomes chave?
      const encontrados: any[] = [];
      const motoristasVistos = new Set();

      const fuse = new Fuse(candidatosCidade.length > 0 ? candidatosCidade : allAtivos, {
        keys: ["nome"],
        threshold: candidatosCidade.length > 0 ? 0.45 : 0.3
      });

      for (const chave of nomesChave) {
        const searchResults = fuse.search(normalizeText(chave));
        if (searchResults.length > 0) {
          const item = searchResults[0].item;
          if (!motoristasVistos.has(item.nomeOriginal)) {
            encontrados.push(item);
            motoristasVistos.add(item.nomeOriginal);
          }
        }
      }

      if (encontrados.length > 0) {
        // Priorizar status: S > REDE > Outros. Ignorar folga "F"
        const validos = encontrados.filter(e => e.status !== "F" && e.status !== "FOLGA");
        
        if (validos.length > 0) {
          validos.sort((a, b) => {
            const getPriority = (s: string) => {
              if (s === "S") return 100;
              if (s === "REDE") return 50;
              return 1;
            };
            return getPriority(b.status) - getPriority(a.status);
          });

          const principal = validos[0];
          return {
            cidade,
            motorista: principal.nomeOriginal,
            encontrado: true,
            status: principal.status,
            coordenador: principal.coordenador || null
          };
        }
      }

      // Se não achou nenhum dos nomes chave, mas tem gente ativa na cidade
      const candidatosValidos = candidatosCidade.filter(c => 
        c.status !== "F" && 
        c.status !== "FOLGA" && 
        STATUS_ATIVO.includes(c.status)
      );
      
      if (candidatosValidos.length > 0) {
        candidatosValidos.sort((a, b) => {
          const getPriority = (s: string) => {
            if (s === "S") return 100;
            if (s === "REDE") return 50;
            return 1;
          };
          return getPriority(b.status) - getPriority(a.status);
        });
        
        const fallback = candidatosValidos[0];
        return {
          cidade,
          motorista: fallback.nomeOriginal,
          encontrado: true,
          status: fallback.status,
          coordenador: fallback.coordenador || null
        };
      }

      return {
        cidade,
        motorista: null,
        encontrado: false,
        status: null,
        coordenador: null
      };
    });

    res.json({
      date: `${targetDay}/${targetMonth}`,
      totalAtivos: allAtivos.length,
      results
    });

  } catch (error: any) {
    console.error("[API Sync Error]:", error);
    res.status(500).json({ error: "Erro interno ao processar escala: " + (error.message || "Erro desconhecido") });
  }
});

// API 404 Handler - Must be after all API routes but before Vite/Static
app.use("/api/*", (req, res) => {
  res.status(404).json({ error: `Rota API não encontrada: ${req.originalUrl}` });
});

async function startServer() {
  try {
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      
      // Catch-all to serve index.html through Vite
      app.use("*", async (req, res, next) => {
        if (req.originalUrl.startsWith("/api")) {
          return next();
        }
        try {
          const indexPath = path.resolve("index.html");
          if (!fs.existsSync(indexPath)) {
            return res.status(500).send("index.html not found");
          }
          let template = fs.readFileSync(indexPath, "utf-8");
          template = await vite.transformIndexHtml(req.originalUrl, template);
          res.status(200).set({ "Content-Type": "text/html" }).end(template);
        } catch (e) {
          vite.ssrFixStacktrace(e as Error);
          next(e);
        }
      });
    } else {
      app.use(express.static("dist"));
      app.get("*", (req, res) => {
        res.sendFile(path.resolve("dist/index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Error starting server:", error);
  }
}

startServer();
