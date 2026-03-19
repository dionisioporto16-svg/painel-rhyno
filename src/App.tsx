/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  ClipboardCheck, 
  RefreshCw, 
  Search, 
  Filter, 
  MapPin, 
  User, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Upload,
  Sun,
  Moon,
  ChevronRight,
  MoreVertical,
  Check,
  X,
  Copy,
  Truck,
  Pencil,
  LogOut,
  BarChart3,
  Gauge,
  Plus,
  Send,
  FileSpreadsheet
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import * as XLSX from 'xlsx';
import { ptBR } from "date-fns/locale";
import { db } from "./firebase";
import { collection, doc, onSnapshot, writeBatch, setDoc, getDocs, deleteField, addDoc, deleteDoc, query, where, orderBy, getDocFromServer } from "firebase/firestore";
import { auth } from "./firebase";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

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

const OPERACAO_METADATA: Record<string, Record<string, { sigla: string, cc: string, horario: string, infoFixa: string, coordenador: string }>> = {
  "1": {
    "SANTA FÉ DO SUL": { sigla: "ZSF", cc: "RMP-010-001", horario: "05:00 - 13:00", infoFixa: "À PARTIR DAS 08:00 (3H TRABALHADAS). Faz intervalo por conta ou REDE. Verificar com motorista.", coordenador: "Rodrigo" },
    "ARARAQUARA": { sigla: "ZTO, ZAR", cc: "RMP-010-005", horario: "05:00 - 13:00", infoFixa: "ENVIAR MSG WPP À PARTIR DAS 09:00", coordenador: "Rodrigo" },
    "EMBU GUAÇU": { sigla: "ZEM", cc: "RMP010008", horario: "05:00 - 13:00", infoFixa: "ALINHAR INTERVALO COM MOTORISTA (FAIXA) à partir das 10:00.", coordenador: "Paulo" },
    "RIO CLARO": { sigla: "ZRX", cc: "RMP-010-006", horario: "06:00 - 14:00", infoFixa: "À PARTIR DAS 09:00 (3H TRABALHADAS). ENVIAR MSG WPP À PARTIR DAS 10:00", coordenador: "Rodrigo" },
    "SIMONSEN": { sigla: "ZZM", cc: "RMP-010-002", horario: "06:00 - 14:00", infoFixa: "1º ALINHAR REDE - MSG LIDER NORTE FAIXA - MOTORISTA VERIFICAR FAIXA - ALINHAR REDE", coordenador: "Rodrigo" },
    "SANTA ADÉLIA": { sigla: "ZSD", cc: "RMP-010-004", horario: "06:00 - 14:00", infoFixa: "Alinho REDE", coordenador: "Rodrigo" },
    "SÃO JOSÉ DO RIO PRETO": { sigla: "ZRU", cc: "RMP-010-003", horario: "06:00 - 14:00", infoFixa: "INTERVALO FIXO DAS 12:00 ÀS 13:00", coordenador: "Rodrigo" },
    "CHAPADÃO DO SUL": { sigla: "TCS", cc: "RMN-010-004", horario: "07:00 - 15:00", infoFixa: "À PARTIR DAS 10:00 (3H TRABALHADAS). ENVIAR MENSAGEM NO WTT À PARTIR DAS 08:30 PARA DAR TEMPO DE ACIONAR REDE (FAUSTO) SE NECESSÁRIO", coordenador: "Marcio" },
    "RONDONÓPOLIS": { sigla: "TRO", cc: "RMN-010-001", horario: "07:00 - 15:00", infoFixa: "Motorista fora do APP. Intervalo questiono Grupo WhatsApp (Carro fixo TRO)", coordenador: "Fernando Uadner" },
    "SÃO VICENTE": { sigla: "ZPT", cc: "RMP-010-010", horario: "07:00 - 15:00", infoFixa: "Grupo WhatsApp (Intervalo Rhyno São Vicente) - as vezes não tem subtsuição para cobrir intervalo", coordenador: "Paulo" },
  },
  "2": {
    "SANTA FÉ DO SUL": { sigla: "ZSF", cc: "RMP-010-001", horario: "13:00 - 21:00", infoFixa: "Não tem suporte Rumo, necessário criar OS para intervalo (seguir modelo de criação) - Na falta de motorista na região, colocar OS manualmente em santa fé. Caso não consiga rede, verificar janela com lider escala - op norte whats", coordenador: "Rodrigo" },
    "ARARAQUARA": { sigla: "ZTO, ZAR", cc: "RMP-010-005", horario: "13:00 - 21:00", infoFixa: "Intervalo no Grupo WhatsApp (TAXI ZTO)", coordenador: "Rodrigo" },
    "EMBU GUAÇU": { sigla: "ZEM", cc: "RMP010008", horario: "13:00 - 21:00", infoFixa: "Entrar em contato com mesa SOS no whatsapp, aguardar retorno. Caso não haja retorno, entre em contato com o motorista do turno para verificar se ele consegue uma janela com a estação, se não for liberado por lá será necessário alinhar um rede.", coordenador: "Paulo" },
    "RIO CLARO": { sigla: "ZRX", cc: "RMP-010-006", horario: "14:00 - 22:00", infoFixa: "Intervalo no WhatsApp (Programador Rio Claro ) - Se pedirem rede, iremos acionar.", coordenador: "Rodrigo" },
    "SIMONSEN": { sigla: "ZZM", cc: "RMP-010-002", horario: "14:00 - 22:00", infoFixa: "Não tem suporte Rumo, necessário criar OS para intervalo do mesmo (seguir modelo de criação) - Na falta de motorista na região, realizar deslocamento em Votuporanga - SP. Ou faz por conta.", coordenador: "Rodrigo" },
    "SANTA ADÉLIA": { sigla: "ZSD", cc: "RMP-010-004", horario: "14:00 - 22:00", infoFixa: "Não tem suporte Rumo, necessário criar OS para intervalo do mesmo (seguir modelo de criação) - Na falta de motorista na região, realizar deslocamento em Catanduva - SP.", coordenador: "Rodrigo" },
    "SÃO JOSÉ DO RIO PRETO": { sigla: "ZRU", cc: "RMP-010-003", horario: "14:00 - 22:00", infoFixa: "Horário fixo intervalo das 2h às 3h (fora do App)", coordenador: "Rodrigo" },
    "CHAPADÃO DO SUL": { sigla: "TCS", cc: "RMN-010-004", horario: "14:00 - 22:00", infoFixa: "Grupo WhatsApp (Equipe Carregamento TAG x TCS | Escala | Tração | Pátio) ou FAZER DESLOCAMENTO FAUSTO DE COSTA RICA (Seguir modelo de criação). Obs.: Caso não haja retorno até às 21:00 confirmando intervalo, seguir com carro Autonomoz.", coordenador: "Marcio" },
    "RONDONÓPOLIS": { sigla: "TRO", cc: "RMN-010-001", horario: "15:00 - 23:00", infoFixa: "Grupo WhatsApp (CARRO FIXO TRO) ou ACIONAR REDE (Seguir modelo de criação). Obs.: Caso não haja retorno até às 21:00 confirmando intervalo, seguir com carro Autonomoz.", coordenador: "Fernando" },
    "SÃO VICENTE": { sigla: "ZPT", cc: "RMP-010-010", horario: "15:00 - 23:00", infoFixa: "Grupo WhatsApp (Intervalo Rhyno São Vicente) - não tem subtsuição para cobrir intervalo", coordenador: "Paulo" },
  },
  "3": {
    "SANTA FÉ DO SUL": { sigla: "ZSF", cc: "RMP-010-001", horario: "21:00 - 05:00", infoFixa: "Faz intervalo por conta.", coordenador: "Nome do Coordenador" },
    "ARARAQUARA": { sigla: "ZTO, ZAR", cc: "RMP-010-005", horario: "21:00 - 05:00", infoFixa: "Intervalo no Grupo WhatsApp (TAXI ZTO) O.S para intervalo automática a partir das 00:00 - Aguardar confirmação WPP (em caso de Permanência, alterar apenas horário para às 03h).", coordenador: "Nome do Coordenador" },
    "EMBU GUAÇU": { sigla: "ZEM", cc: "RMP010008", horario: "21:00 - 05:00", infoFixa: "Verificar com o motorista se será necessário veículo rede para intervalo.", coordenador: "Nome do Coordenador" },
    "RIO CLARO": { sigla: "ZRX", cc: "RMP-010-006", horario: "22:00 - 06:00", infoFixa: "Buscar contato para intervalo no WhatsApp (Programador Rio Claro).", coordenador: "Nome do Coordenador" },
    "SIMONSEN": { sigla: "ZZM", cc: "RMP-010-002", horario: "22:00 - 06:00", infoFixa: "Verificar com o motorista se será necessário veículo rede para intervalo.", coordenador: "Nome do Coordenador" },
    "SANTA ADÉLIA": { sigla: "ZSD", cc: "RMP-010-004", horario: "22:00 - 06:00", infoFixa: "É necessário alinhar veículo rede a partir da 0h30 para intervalo do motorista.", coordenador: "Nome do Coordenador" },
    "SÃO JOSÉ DO RIO PRETO": { sigla: "ZRU", cc: "RMP-010-003", horario: "22:00 - 06:00", infoFixa: "Horário fixo intervalo das 2h às 3h.", coordenador: "Nome do Coordenador" },
    "CHAPADÃO DO SUL": { sigla: "TCS", cc: "RMN-010-004", horario: "23:00 - 07:00", infoFixa: "Grupo WhatsApp (Equipe Carregamento TAG x TCS | Escala | Tração | Pátio) ou fazer deslocamento Fausto de Costa Rica (Seguir modelo de criação). Obs.: Caso não haja retorno até às 4h00 confirmando intervalo, seguir com carro Autonomoz. Edson para ser motorista fixo.", coordenador: "Nome do Coordenador" },
    "RONDONÓPOLIS": { sigla: "TRO", cc: "RMN-010-001", horario: "23:00 - 07:00", infoFixa: "Intervalo questiono Grupo WhatsApp (Carro fixo TRO).", coordenador: "Nome do Coordenador" },
    "SÃO VICENTE": { sigla: "ZPT", cc: "RMP-010-010", horario: "23:00 - 07:00", infoFixa: "Grupo WhatsApp (Intervalo Rhyno São Vicente).", coordenador: "Nome do Coordenador" },
  }
};

const formatCityName = (name: string) => {
  const exceptions = ['do', 'da', 'de', 'dos', 'das'];
  return name.split(' ').map((word, index) => {
    const lower = word.toLowerCase();
    if (index > 0 && exceptions.includes(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
};

const VIA_DATA = [
  { motorista: "RHYNO - Francisco de Assis", centroCusto: "Rumo Logística - Via Paulista", atendimento: "RVP-100-001 / Guarujá-SP / CAMINHÃO", cidade: "GUARUJÁ - SP" },
  { motorista: "RHYNO - Adriano Bitencourt Arrojo", centroCusto: "Rumo Logística - Via Sul", atendimento: "RVS-060-001 / Tupanciretã-RS / CAMINHÃO", cidade: "TUPANCIRETÃ - RS" },
  { motorista: "RHYNO - Airton Melo", centroCusto: "Rumo Logística - Via Paulista", atendimento: "RVP-100-002 / São Vicente-SP / CAMINHÃO", cidade: "SÃO VICENTE - SP" },
  { motorista: "RHYNO - ANTONIO CARLOS DA COSTA", centroCusto: "Rumo Logística - Via Sul", atendimento: "RVS-050-002 / Roca Sales-RS / CAMINHÃO", cidade: "ROCA SALES - RS" },
  { motorista: "RHYNO - DIONI GOERSCH", centroCusto: "Rumo Logística - Via Sul", atendimento: "RVS-060-003 / Cacequi-RS / CAMINHÃO", cidade: "CACEQUI - RS" },
  { motorista: "RHYNO - José Gilberto Antunes dos Santos", centroCusto: "Rumo Logística - Via Sul", atendimento: "RVS-050-003 / Santa Cecilia-SC / CAMINHÃO", cidade: "SANTA CECÍLIA - RS" },
  { motorista: "RHYNO - Silmar Machado", centroCusto: "Rumo Logística - Via Sul", atendimento: "RVS-050-004 / Restinga Seca-RS / CAMINHÃO", cidade: "RESTINGA SECA" },
  { motorista: "RHYNO - CELSO GALVES", centroCusto: "Rumo Logística - Via Paulista", atendimento: "RVP-020-002 / Araraquara-SP / CAMINHÃO / CORREDOR", cidade: "ARARAQUARA - SP" },
  { motorista: "RHYNO - Maria Aparecida", centroCusto: "Rumo Logística - Via Paulista", atendimento: "RVP-070-001 / Araraquara-SP / CAMINHÃO / PÁTIO", cidade: "ARARAQUARA - SP" },
  { motorista: "RHYNO - Gilmar Silvio Neves", centroCusto: "Rumo Logística - Via Oeste", atendimento: "RVO-010-001 / Corumbá-MS / CAMINHÃO", cidade: "AQUIDAUANA - MS" },
  { motorista: "RHYNO - Joely Marcio Santos da Costa", centroCusto: "Rumo Logística - Via Oeste", atendimento: "RVO-010-002 / Campo Grande-MS / CAMINHÃO", cidade: "CAMPO GRANDE - MS" },
  { motorista: "RHYNO - ALEX SANDRO DOS SANTOS / OSMAR DOMINGOS", centroCusto: "Rumo Logística - Via Paulista", atendimento: "RVP-050-002 / Mairinque-SP / CAMINHÃO", cidade: "SÃO ROQUE - SP" },
  { motorista: "RHYNO - Nelson Rodrigues", centroCusto: "Rumo Logística - Via Mecanização", atendimento: "RVM-010-001 / Araraquara-SP / CAMINHÃO", cidade: "ARARAQUARA - SP" },
  { motorista: "RHYNO - Aristóteles Ferreira da Purificação", centroCusto: "Rumo Logística - Via Paulista", atendimento: "RVF-090-002 / Santos-SP / CAMINHÃO", cidade: "SANTOS - SP" },
  { motorista: "RHYNO - ALTEVIR APARECIDO CAETANO", centroCusto: "Rumo Logística - Via Paulista", atendimento: "RVP-020-001 / Pindorama-SP / CAMINHÃO", cidade: "PINDORAMA - SP" },
  { motorista: "RHYNO - Djalma Nunes de Azevedo", centroCusto: "Rumo Logística - Via Oeste", atendimento: "RVP-020-004 / Andradina-SP / CAMINHÃO", cidade: "ANDRADINA - SP" },
  { motorista: "RHYNO - Margarete", centroCusto: "Rumo Logística - Via Paulista", atendimento: "RVP-010-002 / Votuporanga-SP / CAMINHÃO", cidade: "VOTUPORANGA - SP" },
  { motorista: "RHYNO - Luiz Aparecido da Silva", centroCusto: "Rumo Logística - Via Paulista", atendimento: "RVP-020-003 / São José do Rio Preto-SP / CAMINHÃO", cidade: "SJ DO RIO PRETO - SP" },
  { motorista: "RHYNO - Magno Mendes", centroCusto: "Rumo Logística - Via Oeste", atendimento: "RVO-020-002 / Três Lagoas-MS / CAMINHÃO", cidade: "TRÊS LAGOAS - MS" },
  { motorista: "RHYNO - Marcio Moreira Alves", centroCusto: "Rumo Logística - Via Paulista", atendimento: "RVP-010-001 / Jales-SP / CAMINHÃO", cidade: "JALES -SP" },
  { motorista: "RHYNO - Marcos jacinto da Silva", centroCusto: "Rumo Logística - Via Paulista", atendimento: "RVP-060-002 / Sumaré-SP / CAMINHÃO", cidade: "SUMARÉ - SP" },
  { motorista: "RHYNO - Reginaldo de campos luz", centroCusto: "Rumo Logística - Via Paulista", atendimento: "RVP-030-001 / Itirapina-SP / CAMINHÃO", cidade: "ITIRAPINA - SP" },
  { motorista: "RHYNO - Valdemir Dias de Faria / LUCIANO", centroCusto: "Rumo Logística - Via Paulista", atendimento: "RVP-070-002 / São Carlos-SP / CAMINHÃO", cidade: "SÃO CARLOS - SP" },
  { motorista: "RHYNO - Valdir Silvério Bueno", centroCusto: "Rumo Logística - Via Paulista", atendimento: "RVP-060-001 / Limeira-SP / CAMINHÃO", cidade: "LIMEIRA" },
  { motorista: "RHYNO - Georges Shiramatsu", centroCusto: "Rumo Logística - Via Oeste", atendimento: "RVO-020-003 / Guarantã-SP / CAMINHÃO", cidade: "GUARANTÃ -SP" },
  { motorista: "RHYNO - Lucas Alexandre Moraes Mestre", centroCusto: "Rumo Logística - Via Norte", atendimento: "RVN-010-001 / Itiquira-MT / CAMINHÃO", cidade: "ITIQUIRA-MT" },
  { motorista: "RHYNO - Rovani Vergara da Silva", centroCusto: "Rumo Logística - Via Sul", atendimento: "RVS-060-004 / Pelotas-RS / CAMINHÃO", cidade: "PELOTAS - RS" },
  { motorista: "RHYNO - ANTONINHO EVORI PINHEIRO/ IVANDRO", centroCusto: "Rumo Logística - Via Sul", atendimento: "RVS-060-002 / Santa Maria-RS / CAMINHÃO", cidade: "SANTA MARIA - RS" },
  { motorista: "RHYNO - Marcia Marinho Teixeira", centroCusto: "Rumo - Rhyno Malha Paulista", atendimento: "RVS-010-002 / Bauru-SP / CAMINHÃO", cidade: "BAURU - SP" }
];

interface Result {
  cidade: string;
  motorista: string | null;
  encontrado: boolean;
  status: string | null;
  coordenador?: string | null;
  kmInicial?: number | null;
  kmFinal?: number | null;
}

interface SyncData {
  date: string;
  totalAtivos: number;
  results: Result[];
}

export default function App() {
  const [data, setData] = useState<SyncData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("Todas as Cidades");
  const [statusFilter, setStatusFilter] = useState("Todos os Status");
  const [uploading, setUploading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedTurno, setSelectedTurno] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selected_turno") || "3";
    }
    return "3";
  });
  const [activeTab, setActiveTab] = useState("painel");
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark" || 
        (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    return false;
  });
  const [intervalosOk, setIntervalosOk] = useState<Record<string, boolean>>({});
  const [manualRede, setManualRede] = useState<Record<string, boolean>>({});
  const [manualDrivers, setManualDrivers] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("manual_drivers");
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });
  const [manualCoordinators, setManualCoordinators] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("manual_coordinators");
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });
  const [manualInfoFixa, setManualInfoFixa] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("manual_info_fixa");
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });
  const [editingDriver, setEditingDriver] = useState<string | null>(null);
  const [editingCoordinator, setEditingCoordinator] = useState<string | null>(null);
  const [editingInfoFixa, setEditingInfoFixa] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState<Record<string, string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("observacoes_turno");
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [painelSubTab, setPainelSubTab] = useState<"pendentes" | "concluidos">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("painel_sub_tab") as any) || "pendentes";
    }
    return "pendentes";
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [editingKM, setEditingKM] = useState<string | null>(null);
  const [isShiftChangeModalOpen, setIsShiftChangeModalOpen] = useState(false);
  const [shiftItems, setShiftItems] = useState<{
    fixed: any[];
    daily: any[];
    coverage: any[];
    dateFunctions: any[];
  }>({ fixed: [], daily: [], coverage: [], dateFunctions: [] });
  const [shiftChat, setShiftChat] = useState<any[]>([]);
  const [newChatMessage, setNewChatMessage] = useState("");

  useEffect(() => {
    localStorage.setItem("painel_sub_tab", painelSubTab);
  }, [painelSubTab]);
  const [viaSearch, setViaSearch] = useState("");

  const exportToExcel = async () => {
    const wb = XLSX.utils.book_new();
    
    // Arrays to store aggregated data
    const allShiftData = [["Turno", "Seção", "Analista", "Cidade", "O.S", "Ciclo", "Descritivo"]];
    const allDriversData = [["Turno", "Cidade", "Motorista", "Status", "Coordenador", "KM Inicial", "KM Final", "Observação"]];

    // Iterate through shifts 1, 2, 3
    for (const turno of ["1", "2", "3"]) {
      // Fetch data for each shift
      const shiftItemsPath = `schedules/${selectedDate}_${turno}/shiftItems`;
      const shiftItemsSnapshot = await getDocs(collection(db, shiftItemsPath));
      const items = shiftItemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      const fixed = items.filter(i => i.section === "fixed");
      const daily = items.filter(i => i.section === "daily");
      const coverage = items.filter(i => i.section === "coverage");

      // Add to shiftData
      fixed.forEach(i => allShiftData.push([turno, "Informações Fixas", i.analista, i.cidade, i.os, i.ciclo, i.descritivo]));
      daily.forEach(i => allShiftData.push([turno, "Rotina Diária", i.analista, i.cidade, i.os, i.ciclo, i.descritivo]));
      coverage.forEach(i => allShiftData.push([turno, "Coberturas Rede", i.analista, i.cidade, i.os, i.ciclo, i.descritivo]));

      // Fetch assignments for this shift
      const assignmentsPath = `schedules/${selectedDate}_${turno}/assignments`;
      const assignmentsSnapshot = await getDocs(collection(db, assignmentsPath));
      const assignments = assignmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // Fetch results for this shift
      const driversPath = `schedules/${selectedDate}_${turno}/results`;
      const driversSnapshot = await getDocs(collection(db, driversPath));
      const drivers = driversSnapshot.docs.reduce((acc, doc) => {
        acc[doc.id] = doc.data();
        return acc;
      }, {} as Record<string, any>);
      
      // Fetch observations for this shift
      const obsPath = `schedules/${selectedDate}_${turno}/observacoes`;
      const obsSnapshot = await getDocs(collection(db, obsPath));
      const obsData = obsSnapshot.docs.reduce((acc, doc) => {
        acc[doc.id] = doc.data().text;
        return acc;
      }, {} as Record<string, string>);

      // Add to driversData
      assignments.forEach(a => {
        const r = drivers[a.id];
        const status = r?.status || a.status || "PENDENTE";
        allDriversData.push([
          turno,
          a.cidade,
          r?.motorista || a.motorista || "NÃO IDENTIFICADO",
          status,
          r?.coordenador || a.coordenador || "NÃO IDENTIFICADO",
          r?.kmInicial || "",
          r?.kmFinal || "",
          obsData[a.cidade] || ""
        ]);
      });
    }
    
    const wsShift = XLSX.utils.aoa_to_sheet(allShiftData);
    // Auto-width for Shift Sheet
    wsShift['!cols'] = allShiftData[0].map(() => ({ wch: 15 }));
    XLSX.utils.book_append_sheet(wb, wsShift, "Troca de Turno");

    const wsDrivers = XLSX.utils.aoa_to_sheet(allDriversData);
    // Auto-width for Drivers Sheet
    wsDrivers['!cols'] = allDriversData[0].map(() => ({ wch: 15 }));
    XLSX.utils.book_append_sheet(wb, wsDrivers, "Motoristas e Observações");
    
    XLSX.writeFile(wb, `resumo do turno (${selectedDate}).xlsx`);
  };

  const handleCopy = (cidade: string, motorista: string | null, isRede: boolean) => {
    const obs = observacoes[cidade];
    if (obs) {
      const motoristaName = isRede ? "REDE" : (manualDrivers[cidade] || motorista || "NÃO IDENTIFICADO");
      const sigla = OPERACAO_METADATA[selectedTurno]?.[cidade]?.sigla || "OPS";
      navigator.clipboard.writeText(`Motorista ${motoristaName} - ${sigla} - ${obs}`);
      setCopiedId(cidade);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleCopyAllObservations = () => {
    const obsEntries = Object.entries(observacoes).filter(([_, obs]) => (obs as string).trim() !== "");
    if (obsEntries.length === 0) return;

    const textToCopy = obsEntries.map(([cidade, obs]) => {
      const result = data?.results?.find(r => r.cidade === cidade);
      const isRede = result ? (manualRede[cidade] !== undefined ? manualRede[cidade] : result.status === "REDE") : false;
      const motoristaName = isRede ? "REDE" : (manualDrivers[cidade] || result?.motorista || "NÃO IDENTIFICADO");
      const sigla = OPERACAO_METADATA[selectedTurno]?.[cidade]?.sigla || "OPS";
      return `Motorista ${motoristaName} - ${sigla} - ${obs}`;
    }).join("\n\n");
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedId("all_obs");
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(err => {
      console.error("Erro ao copiar:", err);
    });
  };

  useEffect(() => {
    localStorage.setItem("observacoes_turno", JSON.stringify(observacoes));
  }, [observacoes]);

  useEffect(() => {
    localStorage.setItem("manual_drivers", JSON.stringify(manualDrivers));
  }, [manualDrivers]);

  useEffect(() => {
    localStorage.setItem("manual_coordinators", JSON.stringify(manualCoordinators));
  }, [manualCoordinators]);

  useEffect(() => {
    localStorage.setItem("manual_info_fixa", JSON.stringify(manualInfoFixa));
  }, [manualInfoFixa]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleIntervalo = (cidade: string) => {
    const newVal = !intervalosOk[cidade];
    updateAssignment(cidade, { intervaloOk: newVal });
  };

  const toggleManualRede = (cidade: string, currentIsRede: boolean) => {
    const isNowRede = !currentIsRede;
    const updates: any = { isRede: isNowRede };
    
    // Se está ativando REDE, marca intervalo como OK automaticamente
    // Se está desativando REDE, desmarca intervalo para que volte para pendentes
    updates.intervaloOk = isNowRede;
    
    updateAssignment(cidade, updates);
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem("selected_turno", selectedTurno);
  }, [selectedTurno]);

  useEffect(() => {
    const itemsRef = collection(db, `schedules/${selectedDate}_${selectedTurno}/shiftItems`);
    const q = query(itemsRef, orderBy("createdAt", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log("onSnapshot fired for shiftItems, count:", snapshot.size);
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setShiftItems({
        fixed: items.filter((it: any) => it.section === "fixed"),
        daily: items.filter((it: any) => it.section === "daily"),
        coverage: items.filter((it: any) => it.section === "coverage"),
        dateFunctions: items.filter((it: any) => it.section === "dateFunctions")
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `schedules/${selectedDate}_${selectedTurno}/shiftItems`);
    });
    return () => unsubscribe();
  }, [selectedDate, selectedTurno]);

  useEffect(() => {
    const chatRef = collection(db, `schedules/${selectedDate}_${selectedTurno}/shiftChat`);
    const q = query(chatRef, orderBy("createdAt", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setShiftChat(messages);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `schedules/${selectedDate}_${selectedTurno}/shiftChat`);
    });
    return () => unsubscribe();
  }, [selectedDate, selectedTurno]);

  const sendChatMessage = async () => {
    if (!newChatMessage.trim()) return;
    const path = `schedules/${selectedDate}_${selectedTurno}/shiftChat`;
    try {
      const chatRef = collection(db, path);
      await addDoc(chatRef, {
        text: newChatMessage,
        author: auth.currentUser?.email || "Usuário",
        createdAt: new Date().toISOString()
      });
      setNewChatMessage("");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  useEffect(() => {
    console.log("Current shiftItems state:", shiftItems);
  }, [shiftItems]);

  const addShiftItem = async (section: string) => {
    console.log("addShiftItem called for section:", section);
    const path = `schedules/${selectedDate}_${selectedTurno}/shiftItems`;
    console.log("Target path:", path);
    try {
      const itemsRef = collection(db, path);
      await addDoc(itemsRef, {
        section,
        analista: "",
        cidade: "",
        os: "",
        descritivo: "",
        ciclo: "",
        completed: false,
        createdAt: new Date().toISOString()
      });
      console.log("Item added successfully");
    } catch (error) {
      console.error("Error adding shift item:", error);
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const updateShiftItem = async (id: string, field: string, value: any) => {
    const path = `schedules/${selectedDate}_${selectedTurno}/shiftItems/${id}`;
    try {
      const itemRef = doc(db, `schedules/${selectedDate}_${selectedTurno}/shiftItems`, id);
      await setDoc(itemRef, { [field]: value }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const deleteShiftItem = async (id: string) => {
    const path = `schedules/${selectedDate}_${selectedTurno}/shiftItems/${id}`;
    try {
      const itemRef = doc(db, `schedules/${selectedDate}_${selectedTurno}/shiftItems`, id);
      await deleteDoc(itemRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  useEffect(() => {
    const assignmentsRef = collection(db, `schedules/${selectedDate}_${selectedTurno}/assignments`);
    
    setLoading(true);
    const unsubscribe = onSnapshot(assignmentsRef, (snapshot) => {
      const results: Result[] = [];
      const newIntervalosOk: Record<string, boolean> = {};
      const newManualRede: Record<string, boolean> = {};
      const newManualDrivers: Record<string, string> = {};
      const newManualCoordinators: Record<string, string> = {};
      const newObservacoes: Record<string, string> = {};

      snapshot.docs.forEach((docSnap) => {
        const d = docSnap.data();
        const cidade = docSnap.id;
        
        results.push({
          cidade,
          motorista: d.motorista || null,
          encontrado: d.encontrado || false,
          status: d.status || null,
          coordenador: d.coordenador || null,
          kmInicial: d.kmInicial || null,
          kmFinal: d.kmFinal || null
        });

        if (d.intervaloOk !== undefined) newIntervalosOk[cidade] = d.intervaloOk;
        if (d.isRede !== undefined) newManualRede[cidade] = d.isRede;
        if (d.motorista && d.encontrado === false) newManualDrivers[cidade] = d.motorista; // If manually edited
        if (d.coordenador) newManualCoordinators[cidade] = d.coordenador;
        if (d.observacao) newObservacoes[cidade] = d.observacao;
      });

      // Se não houver dados no Firebase para esta data, preenche com as cidades vazias
      if (results.length === 0) {
        // Use the cities from the current shift
        const OPERACOES = {
          "SANTA FÉ DO SUL": [],
          "ARARAQUARA": [],
          "EMBU GUAÇU": [],
          "RIO CLARO": [],
          "SIMONSEN": [],
          "SANTA ADÉLIA": [],
          "SÃO JOSÉ DO RIO PRETO": [],
          "CHAPADÃO DO SUL": [],
          "RONDONÓPOLIS": [],
          "SÃO VICENTE": [],
        };
        Object.keys(OPERACOES).forEach(cidade => {
          results.push({
            cidade,
            motorista: null,
            encontrado: false,
            status: null,
            coordenador: null
          });
        });
      }

      setData({
        date: selectedDate,
        totalAtivos: 0,
        results
      });
      
      setIntervalosOk(newIntervalosOk);
      setManualRede(newManualRede);
      setManualDrivers(newManualDrivers);
      setManualCoordinators(newManualCoordinators);
      setObservacoes(newObservacoes);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      setError("Erro ao ler dados do banco: " + error.message);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedDate, selectedTurno]);

  const updateAssignment = async (cidade: string, updates: any) => {
    try {
      const docRef = doc(db, `schedules/${selectedDate}_${selectedTurno}/assignments/${cidade}`);
      await setDoc(docRef, { cidade, ...updates }, { merge: true });
    } catch (err: any) {
      console.error("Update Error:", err);
      setError("Erro ao atualizar: " + err.message);
    }
  };

  const syncScale = async (dateOverride?: string) => {
    // Agora a sincronização é automática via onSnapshot. 
    // Este botão pode ser usado apenas para forçar uma re-leitura se necessário, mas não é estritamente necessário.
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      // 1. Upload the file to the server
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Falha no upload (${response.status})`);
      }
      
      // 2. Call /api/import-all to parse all dates
      const importResponse = await fetch("/api/import-all");
      if (!importResponse.ok) {
        throw new Error(`Falha ao importar dados (${importResponse.status})`);
      }

      const importData = await importResponse.json();
      
      // 3. Batch write to Firestore
      let batch = writeBatch(db);
      let opCount = 0;

      for (const schedule of importData.schedules) {
        const dateStr = schedule.date; // YYYY-MM-DD
        const turno = schedule.turno;
        for (const result of schedule.results) {
          const docRef = doc(db, `schedules/${dateStr}_${turno}/assignments/${result.cidade}`);
          batch.set(docRef, {
            cidade: result.cidade,
            motorista: result.motorista,
            encontrado: result.encontrado,
            status: result.status,
            coordenador: result.coordenador,
            isRede: result.status === "REDE",
            intervaloOk: result.status === "REDE",
            observacao: ""
          }, { merge: true });
          
          opCount++;
          if (opCount >= 400) { // Firestore batch limit is 500
            await batch.commit();
            batch = writeBatch(db);
            opCount = 0;
          }
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }

      alert("Planilha importada com sucesso para o banco de dados!");
    } catch (err: any) {
      console.error("Upload Error:", err);
      setError("Erro ao enviar arquivo: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    // Tenta sincronizar ao carregar se o arquivo existir
    syncScale(selectedDate);
  }, []);

  useEffect(() => {
    if (data?.results) {
      setIntervalosOk(prev => {
        const next = { ...prev };
        let changed = false;
        data.results.forEach(r => {
          if (r.status === "REDE" && next[r.cidade] !== true) {
            next[r.cidade] = true;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [data]);

  const filteredResults = (data?.results || []).filter(r => {
    const isRede = manualRede[r.cidade] !== undefined ? manualRede[r.cidade] : r.status === "REDE";
    const isOk = isRede || intervalosOk[r.cidade];
    
    const matchesSubTab = painelSubTab === "pendentes" ? !isOk : isOk;
    const matchesSearch = !searchTerm || (r.motorista && r.motorista.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCity = cityFilter === "Todas as Cidades" || r.cidade === cityFilter;
    const matchesStatus = statusFilter === "Todos os Status" || 
      (statusFilter === "Encontrado" && r.encontrado) || 
      (statusFilter === "Não Encontrado" && !r.encontrado) ||
      (statusFilter === "Intervalo Tirado" && isOk) ||
      (statusFilter === "Pendente de Intervalo" && !isOk);
    
    return matchesSubTab && matchesSearch && matchesCity && matchesStatus;
  }).sort((a, b) => {
    const aRede = manualRede[a.cidade] !== undefined ? manualRede[a.cidade] : a.status === "REDE";
    const bRede = manualRede[b.cidade] !== undefined ? manualRede[b.cidade] : b.status === "REDE";
    const aOk = aRede || intervalosOk[a.cidade] || false;
    const bOk = bRede || intervalosOk[b.cidade] || false;
    if (aOk === bOk) return 0;
    return aOk ? 1 : -1;
  });

  const totalItems = data?.results.length || 0;
  const confirmadosCount = data?.results.filter(r => {
    const isRede = manualRede[r.cidade] !== undefined ? manualRede[r.cidade] : r.status === "REDE";
    return isRede || intervalosOk[r.cidade];
  }).length || 0;
  const pendentesCount = totalItems - confirmadosCount;
  const progressoValue = totalItems > 0 ? Math.round((confirmadosCount / totalItems) * 100) : 0;

  const stats = {
    confirmados: confirmadosCount,
    pendentes: pendentesCount,
    progresso: progressoValue
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? "bg-[#0A0A0A] text-[#E0E0E0]" : "bg-[#F4F5F7] text-[#1A1A1A]"} font-sans`}>
      {/* Header */}
      <motion.header 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
        className={`sticky top-0 z-50 backdrop-blur-md border-b ${isDarkMode ? "bg-[#141414]/80 border-white/10" : "bg-white/80 border-black/5"} py-3 px-6 flex justify-between items-center shadow-sm`}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black tracking-tight flex items-center gap-1.5">
            <span className="text-yellow-400">RHYNO</span>
            <span className={isDarkMode ? "text-white" : "text-black"}>CONTROL</span>
          </h1>
        </div>
        
        <nav className="hidden md:flex gap-8">
          {[
            { icon: LayoutDashboard, label: "Painel", id: "painel" },
            { icon: Truck, label: "VIA", id: "via" },
            { icon: RefreshCw, label: "Troca de Turno", id: "shift_change_btn" },
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => {
                if (item.id === "shift_change_btn") {
                  setIsShiftChangeModalOpen(true);
                } else {
                  setActiveTab(item.id);
                }
              }}
              className={`flex items-center gap-2 text-sm font-semibold transition-all ${
                activeTab === item.id 
                  ? "text-[#FF5722]" 
                  : isDarkMode ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-black"
              }`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <div className={`hidden md:flex flex-col items-end mr-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
            <span className="text-xs font-bold tracking-wider uppercase">
              {format(currentTime, "dd MMM yyyy", { locale: ptBR })}
            </span>
            <span className="text-sm font-black text-[#FF5722]">
              {format(currentTime, "HH:mm:ss")}
            </span>
          </div>

          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-2 rounded-full transition-colors ${isDarkMode ? "bg-white/5 hover:bg-white/10 text-yellow-400" : "bg-black/5 hover:bg-black/10 text-indigo-600"}`}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </motion.header>

      <main className="max-w-7xl mx-auto p-6 lg:p-10">
        <AnimatePresence mode="wait">
          {activeTab === "painel" ? (
            <motion.div
              key="painel"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              {/* Title and Sync Button */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-12">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-col gap-2">
                  <span className={`text-[10px] font-bold tracking-[0.2em] uppercase ${isDarkMode ? "text-[#5C728A]" : "text-gray-500"}`}>
                    Desenvolvido por Dionisio Porto
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#FF5722]" />
                    <span className={`text-[11px] font-bold tracking-[0.15em] uppercase ${isDarkMode ? "text-[#A0AAB5]" : "text-gray-600"}`}>Sistema de Monitoramento</span>
                  </div>
                </div>
                <h2 className={`text-6xl lg:text-7xl font-black tracking-tighter leading-[0.9] ${isDarkMode ? "text-[#E0E0E0]" : "text-[#1A1A1A]"}`}>
                  Painel <br className="hidden lg:block" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF5722] to-[#FF8A65]">Operacional</span>
                </h2>
              </motion.div>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className={`flex items-center gap-4 mt-4 px-5 py-3.5 rounded-2xl border inline-flex w-fit ${isDarkMode ? "bg-[#141414] border-white/10" : "bg-white border-black/10 shadow-sm"}`}
            >
              <Clock size={18} className="text-[#FF5722]" />
              <span className={`text-xs font-bold uppercase tracking-widest ${isDarkMode ? "text-[#5C728A]" : "text-gray-500"}`}>Escala de:</span>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  syncScale(e.target.value);
                }}
                style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
                className={`bg-transparent cursor-pointer font-bold text-sm transition-colors focus:outline-none ${isDarkMode ? "text-[#E0E0E0]" : "text-[#1A1A1A]"}`}
              />
              <div className={`w-px h-4 ${isDarkMode ? "bg-white/20" : "bg-black/10"}`}></div>
              <select
                value={selectedTurno}
                onChange={(e) => setSelectedTurno(e.target.value)}
                className={`bg-transparent cursor-pointer font-bold text-sm transition-colors focus:outline-none ${isDarkMode ? "text-[#E0E0E0]" : "text-[#1A1A1A]"}`}
              >
                <option value="1" className={isDarkMode ? "bg-[#141414]" : "bg-white"}>1º Turno</option>
                <option value="2" className={isDarkMode ? "bg-[#141414]" : "bg-white"}>2º Turno</option>
                <option value="3" className={isDarkMode ? "bg-[#141414]" : "bg-white"}>3º Turno</option>
              </select>
            </motion.div>
          </div>

        {/* Stats Cards */}
        <motion.div 
          variants={{
            show: { transition: { staggerChildren: 0.1 } }
          }}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 max-w-6xl mx-auto"
        >
          {[
            { 
              label: "Confirmados", 
              value: stats.confirmados, 
              color: "emerald",
              icon: CheckCircle2,
              desc: "Motoristas validados"
            },
            { 
              label: "Pendentes", 
              value: stats.pendentes, 
              color: "rose",
              icon: Clock,
              desc: "Aguardando verificação"
            },
            { 
              label: "Progresso", 
              value: stats.progresso, 
              color: "sky",
              icon: BarChart3,
              desc: "Conclusão do turno",
              isPercent: true
            },
          ].map((stat, i) => {
            const colors = {
              emerald: {
                border: isDarkMode ? "border-emerald-500/30" : "border-emerald-500/20",
                shadow: "hover:shadow-[0_0_30px_rgba(16,185,129,0.2)]",
                led: "via-emerald-500/60",
                dot: "bg-emerald-500 shadow-emerald-500/50",
                iconBg: isDarkMode ? "bg-emerald-500/10" : "bg-emerald-50",
                text: "text-emerald-500",
                glow: "bg-emerald-500"
              },
              rose: {
                border: isDarkMode ? "border-rose-500/30" : "border-rose-500/20",
                shadow: "hover:shadow-[0_0_30px_rgba(244,63,94,0.2)]",
                led: "via-rose-500/60",
                dot: "bg-rose-500 shadow-rose-500/50",
                iconBg: isDarkMode ? "bg-rose-500/10" : "bg-rose-50",
                text: "text-rose-500",
                glow: "bg-rose-500"
              },
              sky: {
                border: isDarkMode ? "border-sky-500/30" : "border-sky-500/20",
                shadow: "hover:shadow-[0_0_30px_rgba(14,165,233,0.2)]",
                led: "via-sky-500/60",
                dot: "bg-sky-500 shadow-sky-500/50",
                iconBg: isDarkMode ? "bg-sky-500/10" : "bg-sky-50",
                text: "text-sky-500",
                glow: "bg-sky-500"
              }
            }[stat.color as 'emerald' | 'rose' | 'sky'];

            return (
              <motion.div 
                key={i} 
                variants={{
                  hidden: { opacity: 0, y: 30, scale: 0.95 },
                  show: { opacity: 1, y: 0, scale: 1 }
                }}
                whileHover={{ y: -8, transition: { duration: 0.3, ease: "easeOut" } }}
                className={`relative p-8 rounded-[2.5rem] border overflow-hidden group transition-all duration-500 ${
                  isDarkMode 
                    ? `bg-[#141414] ${colors.border} shadow-[0_0_20px_rgba(0,0,0,0.4)]` 
                    : `bg-white ${colors.border} shadow-xl shadow-black/[0.02]`
                } ${colors.shadow}`}
              >
                {/* LED Glow Effect Top */}
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[1px] bg-gradient-to-r from-transparent ${colors.led} to-transparent`} />
                
                {/* Decorative Background Glow */}
                <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full blur-3xl opacity-10 ${colors.glow} transition-opacity group-hover:opacity-30`} />
                
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-6">
                    <div className={`p-3 rounded-2xl ${colors.iconBg}`}>
                      <stat.icon size={24} className={colors.text} />
                    </div>
                    <div className="flex flex-col items-end">
                      <div className={`w-2 h-2 rounded-full ${colors.dot} shadow-[0_0_10px] animate-pulse`} />
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <span className={`text-sm font-bold mb-1 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                      {stat.label}
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-6xl font-black tracking-tighter ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}>
                        {stat.value}
                      </span>
                      {stat.isPercent && (
                        <span className={`text-2xl font-bold ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}>%</span>
                      )}
                    </div>
                    <p className="text-[11px] font-medium text-gray-500 mt-2 uppercase tracking-wider">
                      {stat.desc}
                    </p>
                  </div>

                  {stat.isPercent && (
                    <div className="mt-6">
                      <div className={`w-full h-2 rounded-full overflow-hidden ${isDarkMode ? "bg-white/5" : "bg-black/5"}`}>
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${stat.value}%` }}
                          transition={{ duration: 1, delay: 0.5, ease: "circOut" }}
                          className={`h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 shadow-lg shadow-sky-500/20`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Sub-tabs for Painel */}
        <div className="flex gap-4 mb-8 border-b border-white/5 pb-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setPainelSubTab("pendentes")}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 relative ${
              painelSubTab === "pendentes"
                ? "text-white shadow-lg shadow-[#FF5722]/20"
                : isDarkMode ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-black/5 text-gray-500 hover:bg-black/10"
            }`}
          >
            <Clock size={16} className="relative z-10" />
            <span className="relative z-10">Pendentes ({stats.pendentes})</span>
            {painelSubTab === "pendentes" && (
              <motion.div
                layoutId="activeSubTab"
                className="absolute inset-0 bg-[#FF5722] rounded-xl"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setPainelSubTab("concluidos")}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 relative ${
              painelSubTab === "concluidos"
                ? "text-white shadow-lg shadow-emerald-500/20"
                : isDarkMode ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-black/5 text-gray-500 hover:bg-black/10"
            }`}
          >
            <CheckCircle2 size={16} className="relative z-10" />
            <span className="relative z-10">Concluídos ({stats.confirmados})</span>
            {painelSubTab === "concluidos" && (
              <motion.div
                layoutId="activeSubTab"
                className="absolute inset-0 bg-emerald-500 rounded-xl"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </motion.button>
        </div>

        {/* Filters */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={`p-2 rounded-2xl shadow-sm border flex flex-col lg:flex-row gap-2 mb-12 ${isDarkMode ? "bg-[#141414] border-white/5" : "bg-white border-black/5"}`}
        >
          <div className="flex-1 relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#FF5722] transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Buscar motorista..." 
              className={`w-full pl-12 pr-4 py-3 bg-transparent rounded-xl focus:outline-none text-sm`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className={`hidden lg:block w-px h-8 self-center ${isDarkMode ? "bg-white/10" : "bg-black/5"}`} />
          <select 
            className="bg-transparent rounded-xl px-4 py-3 focus:outline-none text-sm font-semibold cursor-pointer"
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
          >
            <option className={isDarkMode ? "bg-[#141414]" : "bg-white"}>Todas as Cidades</option>
            {Object.keys(OPERACOES).map(c => <option key={c} className={isDarkMode ? "bg-[#141414]" : "bg-white"}>{c}</option>)}
          </select>
          <div className={`hidden lg:block w-px h-8 self-center ${isDarkMode ? "bg-white/10" : "bg-black/5"}`} />
          <select 
            className="bg-transparent rounded-xl px-4 py-3 focus:outline-none text-sm font-semibold cursor-pointer"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option className={isDarkMode ? "bg-[#141414]" : "bg-white"}>Todos os Status</option>
            <option className={isDarkMode ? "bg-[#141414]" : "bg-white"}>Encontrado</option>
            <option className={isDarkMode ? "bg-[#141414]" : "bg-white"}>Não Encontrado</option>
            <option className={isDarkMode ? "bg-[#141414]" : "bg-white"}>Intervalo Tirado</option>
            <option className={isDarkMode ? "bg-[#141414]" : "bg-white"}>Pendente de Intervalo</option>
          </select>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`p-6 rounded-2xl border mb-12 flex items-center gap-4 ${isDarkMode ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-rose-50 border-rose-100 text-rose-600"}`}
          >
            <AlertCircle size={24} />
            <div className="flex-1">
              <h3 className="font-bold text-sm uppercase tracking-wider">Erro de Sincronização</h3>
              <p className="text-xs opacity-80 mt-1">{error}</p>
            </div>
          </motion.div>
        )}

        {/* Grid of Results */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredResults.map((result) => {
              const isRede = manualRede[result.cidade] !== undefined ? manualRede[result.cidade] : result.status === "REDE";
              const isIntervaloOk = isRede || intervalosOk[result.cidade];
              const displayMotorista = isRede ? "REDE" : (manualDrivers[result.cidade] || (result.encontrado ? result.motorista : "NÃO IDENTIFICADO"));
              const displayStatus = isRede ? "REDE" : (result.status || (result.encontrado ? "ATIVO" : "PENDENTE"));

              return (
              <motion.div 
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileHover={{ y: -5, transition: { duration: 0.2 } }}
                key={result.cidade}
                className={`group rounded-3xl shadow-sm border transition-all duration-300 hover:shadow-md overflow-hidden flex flex-col ${
                  isDarkMode ? "bg-[#141414] border-white/5" : "bg-white border-black/5"
                }`}
              >
                {/* Header */}
                <div className={`px-6 py-5 border-b flex justify-between items-start ${isDarkMode ? "border-white/5 bg-white/5" : "border-black/5 bg-black/5"}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col">
                        <h3 className={`text-xl font-black tracking-tighter leading-none mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                          {formatCityName(result.cidade)}
                        </h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded border ${isDarkMode ? "bg-[#FF5722]/10 border-[#FF5722]/20 text-[#FF5722]" : "bg-[#FF5722]/5 border-[#FF5722]/10 text-[#FF5722]"}`}>
                          {OPERACAO_METADATA[selectedTurno]?.[result.cidade]?.sigla || "OPS"}
                        </span>
                        {OPERACAO_METADATA[selectedTurno]?.[result.cidade]?.cc && (
                          <span className={`text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded border ${isDarkMode ? "bg-white/5 border-white/10 text-gray-400" : "bg-black/5 border-black/10 text-gray-500"}`}>
                            {OPERACAO_METADATA[selectedTurno]?.[result.cidade]?.cc}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 group/coord mt-1">
                      {editingCoordinator === result.cidade ? (
                        <input
                          type="text"
                          autoFocus
                          className={`text-[10px] font-medium uppercase tracking-wider px-1 py-0.5 rounded border outline-none w-40 ${isDarkMode ? "bg-[#1A1A1A] border-white/20 text-white" : "bg-white border-black/20 text-black"}`}
                          defaultValue={manualCoordinators[result.cidade] || result.coordenador || OPERACAO_METADATA[selectedTurno]?.[result.cidade]?.coordenador || "Coordenador"}
                          onBlur={(e) => {
                            const val = e.target?.value;
                            if (val !== undefined) {
                              updateAssignment(result.cidade, { coordenador: val });
                            }
                            setEditingCoordinator(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = e.currentTarget?.value;
                              if (val !== undefined) {
                                updateAssignment(result.cidade, { coordenador: val });
                              }
                              setEditingCoordinator(null);
                            } else if (e.key === 'Escape') {
                              setEditingCoordinator(null);
                            }
                          }}
                        />
                      ) : (
                        <>
                          <span className={`text-[10px] font-medium uppercase tracking-wider opacity-60`}>
                            {manualCoordinators[result.cidade] || result.coordenador || OPERACAO_METADATA[selectedTurno]?.[result.cidade]?.coordenador || "Coordenador"}
                          </span>
                          <button 
                            onClick={() => setEditingCoordinator(result.cidade)}
                            className="opacity-0 group-hover/coord:opacity-100 transition-opacity"
                          >
                            <Pencil size={10} className="text-gray-400 hover:text-[#FF5722]" />
                          </button>
                        </>
                      )}
                    </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold opacity-70">
                    <Clock size={12} className="text-[#FF5722]" />
                    <span>{OPERACAO_METADATA[selectedTurno]?.[result.cidade]?.horario || "--:--"}</span>
                  </div>
                </div>

                {/* Body */}
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex-1 pr-4">
                      {editingDriver === result.cidade ? (
                        <input
                          type="text"
                          autoFocus
                          className={`text-2xl font-black tracking-tighter leading-tight mb-2 w-full bg-transparent border-b-2 outline-none ${isDarkMode ? "border-[#FF5722] text-white" : "border-[#FF5722] text-black"}`}
                          defaultValue={displayMotorista}
                          onBlur={(e) => {
                            const val = e.target?.value;
                            if (val !== undefined) {
                              updateAssignment(result.cidade, { motorista: val, encontrado: false });
                            }
                            setEditingDriver(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = e.currentTarget?.value;
                              if (val !== undefined) {
                                updateAssignment(result.cidade, { motorista: val, encontrado: false });
                              }
                              setEditingDriver(null);
                            } else if (e.key === 'Escape') {
                              setEditingDriver(null);
                            }
                          }}
                        />
                      ) : (
                        <div className="flex items-center gap-3 group/driver mb-2">
                          <h3 className={`text-2xl font-black tracking-tighter leading-tight ${
                            result.encontrado || isRede || manualDrivers[result.cidade]
                              ? isDarkMode ? "text-white" : "text-black" 
                              : "text-gray-400"
                          }`}>
                            {displayMotorista}
                          </h3>
                          <div className="flex items-center gap-1.5 ml-2">
                            {!isRede && (
                              <motion.button 
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setEditingDriver(result.cidade)}
                                className="opacity-0 group-hover/driver:opacity-100 transition-all shrink-0 text-gray-400 hover:text-[#FF5722]"
                              >
                                <Pencil size={14} />
                              </motion.button>
                            )}
                            {!isRede && (
                              <motion.button 
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setEditingKM(result.cidade)}
                                className={`transition-all shrink-0 ${
                                  (result.kmInicial || result.kmFinal)
                                    ? "text-[#FF5722] opacity-100"
                                    : "opacity-0 group-hover/driver:opacity-100 text-gray-400 hover:text-[#FF5722]"
                                }`}
                                title="Registrar KM"
                              >
                                <Gauge size={14} />
                              </motion.button>
                            )}
                          </div>
                        </div>
                      )}
                      {displayStatus !== "S" && displayStatus !== "REDE" && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">
                            {displayStatus}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                      isIntervaloOk 
                        ? isDarkMode ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-600"
                        : isDarkMode ? "bg-rose-500/20 text-rose-400" : "bg-rose-100 text-rose-600"
                    }`}>
                      {isIntervaloOk ? <Check size={24} /> : <X size={24} />}
                    </div>
                  </div>

                  <div className={`p-4 rounded-xl border-l-2 border-[#FF5722] mb-6 text-sm leading-relaxed group/info ${isDarkMode ? "bg-[#FF5722]/5 text-gray-300" : "bg-[#FF5722]/5 text-gray-700"}`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-[#FF5722] block">
                        Informações fixas
                      </span>
                      <motion.button 
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setEditingInfoFixa(result.cidade)}
                        className="opacity-0 group-hover/info:opacity-100 transition-opacity shrink-0"
                      >
                        <Pencil size={12} className="text-[#FF5722] hover:text-[#E64A19]" />
                      </motion.button>
                    </div>
                    {editingInfoFixa === result.cidade ? (
                      <textarea
                        autoFocus
                        className={`w-full bg-transparent border-b-2 outline-none resize-none overflow-hidden ${isDarkMode ? "border-[#FF5722] text-white" : "border-[#FF5722] text-black"}`}
                        defaultValue={manualInfoFixa[result.cidade] || OPERACAO_METADATA[selectedTurno]?.[result.cidade]?.infoFixa || "Nenhuma informação adicional."}
                        onBlur={(e) => {
                          const val = e.target.value;
                          setManualInfoFixa(prev => ({ ...prev, [result.cidade]: val }));
                          setEditingInfoFixa(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            const val = e.currentTarget.value;
                            setManualInfoFixa(prev => ({ ...prev, [result.cidade]: val }));
                            setEditingInfoFixa(null);
                          } else if (e.key === 'Escape') {
                            setEditingInfoFixa(null);
                          }
                        }}
                        rows={3}
                      />
                    ) : (
                      <span className="font-normal whitespace-pre-wrap">
                        {manualInfoFixa[result.cidade] || OPERACAO_METADATA[selectedTurno]?.[result.cidade]?.infoFixa || "Nenhuma informação adicional."}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 cursor-pointer group" onClick={() => toggleManualRede(result.cidade, isRede)}>
                        <button
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-300 focus:outline-none ${isRede ? 'bg-[#FF5722] shadow-[0_0_10px_rgba(255,87,34,0.4)]' : isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${isRede ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                        </button>
                        <span className={`text-[11px] font-bold uppercase tracking-widest transition-all duration-300 ${isRede ? 'text-[#FF5722]' : 'opacity-50 group-hover:opacity-100'}`}>
                          {isRede ? 'REDE ATIVA' : 'USAR REDE'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold opacity-70">Intervalo</span>
                        <label className={`relative inline-flex items-center ${isRede ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={isIntervaloOk || false} 
                            onChange={() => {
                              if (!isRede) toggleIntervalo(result.cidade);
                            }} 
                            disabled={isRede}
                          />
                          <div className={`w-10 h-5 rounded-full peer transition-all peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all ${
                            isDarkMode ? "bg-white/10 peer-checked:bg-emerald-500" : "bg-black/10 peer-checked:bg-emerald-500"
                          }`}></div>
                        </label>
                      </div>
                    </div>
                    
                    <div className="relative">
                      <textarea 
                        rows={2}
                        placeholder="Adicionar observação..." 
                        value={observacoes[result.cidade] || ""}
                        onChange={(e) => setObservacoes(prev => ({ ...prev, [result.cidade]: e.target.value }))}
                        onBlur={(e) => updateAssignment(result.cidade, { observacao: e.target.value })}
                        className={`w-full bg-transparent border-b py-1.5 pr-8 text-xs focus:outline-none transition-colors resize-none ${
                          isDarkMode ? "border-white/10 focus:border-[#FF5722]" : "border-black/10 focus:border-[#FF5722]"
                        }`}
                      />
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleCopy(result.cidade, result.encontrado ? result.motorista : null, isRede)}
                        className={`absolute right-0 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${
                          isDarkMode ? "hover:bg-white/10 text-gray-400 hover:text-white" : "hover:bg-black/5 text-gray-500 hover:text-black"
                        }`}
                        title="Copiar observação"
                      >
                        <Copy size={14} />
                      </motion.button>
                      <AnimatePresence>
                        {copiedId === result.cidade && (
                          <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="absolute right-8 top-1/2 -translate-y-1/2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm whitespace-nowrap z-10"
                          >
                            Copiado com sucesso :)
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

        <div className="mt-8 flex justify-end relative gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={exportToExcel}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
              isDarkMode 
                ? "bg-emerald-900/50 hover:bg-emerald-900/70 text-emerald-100" 
                : "bg-emerald-100 hover:bg-emerald-200 text-emerald-800"
            }`}
          >
            <FileSpreadsheet size={18} />
            Exportar para Excel
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCopyAllObservations}
            disabled={Object.values(observacoes).filter(obs => (obs as string).trim() !== "").length === 0}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              isDarkMode 
                ? "bg-white/10 hover:bg-white/20 text-white" 
                : "bg-black/5 hover:bg-black/10 text-black"
            }`}
          >
            <Copy size={18} />
            Copiar Todas as Observações
          </motion.button>
          <AnimatePresence>
            {copiedId === "all_obs" && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute right-0 -top-10 bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded shadow-sm whitespace-nowrap z-10"
              >
                Todas as observações copiadas!
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </motion.div>
        ) : activeTab === "via" ? (
          <motion.div 
            key="via"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col gap-6"
          >
            <div className="flex flex-col gap-2 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-[#FF5722] animate-pulse" />
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-50">Tabela de Operações</span>
              </div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-4xl lg:text-5xl font-black tracking-tighter">
                  VIA
                </h2>
                <div className="relative w-full md:w-72">
                  <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} size={16} />
                  <input
                    type="text"
                    placeholder="Pesquisar..."
                    value={viaSearch}
                    onChange={(e) => setViaSearch(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2 rounded-xl border text-sm focus:outline-none transition-colors ${
                      isDarkMode ? "bg-[#1A1A1A] border-white/10 focus:border-[#FF5722]" : "bg-white border-black/10 focus:border-[#FF5722]"
                    }`}
                  />
                </div>
              </div>
            </div>
            
            <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDarkMode ? "bg-[#141414] border-white/5" : "bg-white border-black/5"}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className={`text-xs uppercase font-bold tracking-wider ${isDarkMode ? "bg-white/5 text-gray-400" : "bg-black/5 text-gray-600"}`}>
                    <tr>
                      <th className="px-6 py-4">Operação</th>
                      <th className="px-6 py-4">Nome Motorista</th>
                      <th className="px-6 py-4">Centro de Custo</th>
                      <th className="px-6 py-4">Atendimento</th>
                      <th className="px-6 py-4">Cidade</th>
                      <th className="px-6 py-4">Tipo de Viagem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-white/5">
                    {VIA_DATA.filter(row => 
                      !viaSearch || 
                      Object.values(row).some(val => 
                        val.toString().toLowerCase().includes(viaSearch.toLowerCase())
                      )
                    ).map((row, index) => (
                      <tr key={index} className={`transition-colors ${isDarkMode ? "hover:bg-white/5" : "hover:bg-black/5"}`}>
                        <td className="px-6 py-4 font-medium">VIA</td>
                        <td className="px-6 py-4">{row.motorista}</td>
                        <td className="px-6 py-4">{row.centroCusto}</td>
                        <td className="px-6 py-4">{row.atendimento}</td>
                        <td className="px-6 py-4">{row.cidade}</td>
                        <td className="px-6 py-4">027 - VIA</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : null}
        </AnimatePresence>
      </main>
      <motion.footer 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className={`mt-20 py-10 px-6 border-t ${isDarkMode ? "bg-[#0A0A0A] border-white/5" : "bg-white border-black/5"}`}
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${isDarkMode ? "bg-white text-black" : "bg-black text-white"}`}>R</div>
            <span className="text-xs font-bold tracking-widest uppercase">Rhyno Control v2.0</span>
          </div>

          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <motion.label 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`flex-1 md:flex-none justify-center px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm border cursor-pointer active:scale-95 ${
                isDarkMode 
                  ? "bg-white/5 border-white/10 hover:bg-white/10 text-white" 
                  : "bg-white border-black/5 hover:bg-gray-50 text-gray-700"
              }`}
            >
              <Upload size={16} className={uploading ? "animate-bounce" : ""} />
              <span className="text-xs">{uploading ? "Importando..." : "Importar Planilha"}</span>
              <input type="file" accept=".xlsx" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </motion.label>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => syncScale(selectedDate)}
              disabled={loading}
              className="flex-1 md:flex-none justify-center bg-[#FF5722] hover:bg-[#E64A19] text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-[#FF5722]/20 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              <span className="text-xs">{loading ? "Sincronizando..." : "Sincronizar Planilha"}</span>
            </motion.button>
          </div>
        </div>
      </motion.footer>

      {/* Shift Change Modal */}
      <AnimatePresence>
        {isShiftChangeModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsShiftChangeModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={`relative w-full max-w-2xl overflow-hidden rounded-3xl shadow-2xl ${
                isDarkMode ? "bg-[#141414] border border-white/10" : "bg-white"
              }`}
            >
              <div className="p-8 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 rounded-2xl bg-[#FF5722]/10 text-[#FF5722]">
                    <RefreshCw size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black tracking-tight">Troca de Turno</h3>
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-bold uppercase tracking-widest opacity-50 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                        Finalização do Turno {selectedTurno}
                      </p>
                      <span className="w-1 h-1 rounded-full bg-gray-400 opacity-50" />
                      <p className={`text-xs font-bold uppercase tracking-widest opacity-50 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                        {format(new Date(selectedDate + "T12:00:00"), "dd/MM/yyyy")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-6 flex flex-col gap-10">
                  {[
                    { id: "fixed", label: "Informações Fixas", color: "text-yellow-400", items: shiftItems.fixed },
                    { id: "daily", label: "Rotina Diária", color: "text-emerald-400", items: shiftItems.daily },
                    { id: "coverage", label: "Coberturas Rede", color: "text-[#FF5722]", items: shiftItems.coverage },
                  ].map((section, idx) => {
                    const filteredItems = section.items.filter(it => {
                      if (statusFilter === "Completos") return false;
                      return !it.completed;
                    });

                    if (statusFilter === "Completos") return null;
                    if (statusFilter === "Pendentes" && filteredItems.length === 0 && section.items.length > 0) return null;

                    return (
                      <motion.div 
                        key={section.id} 
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="flex flex-col gap-4"
                      >
                        <div className="flex justify-between items-center px-2">
                          <label className={`text-xs font-black uppercase tracking-[0.2em] opacity-80 ${section.color}`}>
                            {section.label}
                          </label>
                          <motion.button 
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => addShiftItem(section.id)}
                            className={`p-2.5 rounded-xl transition-all cursor-pointer ${isDarkMode ? "bg-white/10 hover:bg-white/20 text-white" : "bg-black/5 hover:bg-black/10 text-black"}`}
                          >
                            <Plus size={18} />
                          </motion.button>
                        </div>

                        <div className="flex flex-col gap-2">
                          {filteredItems.length === 0 ? (
                            <motion.div 
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className={`p-4 rounded-2xl border border-dashed text-center text-xs opacity-40 ${isDarkMode ? "border-white/10" : "border-black/10"}`}
                            >
                              {section.items.length > 0 ? "Todos os itens concluídos" : "Nenhum item adicionado"}
                            </motion.div>
                          ) : (
                            <div className="flex flex-col gap-3">
                              <AnimatePresence mode="popLayout">
                                {filteredItems.map((item) => (
                                  <motion.div 
                                    layout
                                    layoutId={item.id}
                                    key={item.id}
                                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                    className={`p-4 rounded-2xl border transition-all ${isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-black/5 shadow-sm"}`}
                                  >
                                    <div className="flex items-start gap-4 mb-3">
                                      <div className="pt-1">
                                        <input 
                                          type="checkbox"
                                          checked={item.completed || false}
                                          onChange={(e) => updateShiftItem(item.id, "completed", e.target.checked)}
                                          className="w-4 h-4 rounded border-gray-300 text-[#FF5722] focus:ring-[#FF5722] cursor-pointer"
                                        />
                                      </div>
                                      <div className="flex-1 grid grid-cols-12 gap-3">
                                        <div className="col-span-2">
                                          <input 
                                            placeholder="Turno"
                                            value={item.turno || ""}
                                            onChange={(e) => updateShiftItem(item.id, "turno", e.target.value)}
                                            className={`w-full bg-transparent text-xs font-bold uppercase tracking-wider focus:outline-none border-b ${isDarkMode ? "border-white/10 focus:border-white/30" : "border-black/10 focus:border-black/30"}`}
                                          />
                                        </div>
                                        <div className="col-span-3">
                                          <input 
                                            placeholder="Analista"
                                            value={item.analista}
                                            onChange={(e) => updateShiftItem(item.id, "analista", e.target.value)}
                                            className={`w-full bg-transparent text-xs font-bold uppercase tracking-wider focus:outline-none border-b ${isDarkMode ? "border-white/10 focus:border-white/30" : "border-black/10 focus:border-black/30"}`}
                                          />
                                        </div>
                                        <div className="col-span-3">
                                          <input 
                                            placeholder="Cidade"
                                            value={item.cidade || ""}
                                            onChange={(e) => updateShiftItem(item.id, "cidade", e.target.value)}
                                            className={`w-full bg-transparent text-xs font-bold uppercase tracking-wider focus:outline-none border-b ${isDarkMode ? "border-white/10 focus:border-white/30" : "border-black/10 focus:border-black/30"}`}
                                          />
                                        </div>
                                        <div className="col-span-2">
                                          <input 
                                            placeholder="O.S"
                                            value={item.os}
                                            onChange={(e) => updateShiftItem(item.id, "os", e.target.value)}
                                            className={`w-full bg-transparent text-xs font-bold focus:outline-none border-b ${isDarkMode ? "border-white/10 focus:border-white/30" : "border-black/10 focus:border-black/30"}`}
                                          />
                                        </div>
                                        <div className="col-span-2 flex justify-between items-center">
                                          <input 
                                            placeholder="Ciclo"
                                            value={item.ciclo}
                                            onChange={(e) => updateShiftItem(item.id, "ciclo", e.target.value)}
                                            className={`w-full bg-transparent text-xs font-bold focus:outline-none border-b ${isDarkMode ? "border-white/10 focus:border-white/30" : "border-black/10 focus:border-black/30"}`}
                                          />
                                          <motion.button 
                                            whileHover={{ scale: 1.2, color: "#ef4444" }}
                                            whileTap={{ scale: 0.8 }}
                                            onClick={() => deleteShiftItem(item.id)}
                                            className="text-red-500/50 transition-colors ml-2"
                                          >
                                            <X size={14} />
                                          </motion.button>
                                        </div>
                                      </div>
                                    </div>
                                    <textarea 
                                      rows={2}
                                      placeholder="Descritivo..."
                                      value={item.descritivo}
                                      onChange={(e) => updateShiftItem(item.id, "descritivo", e.target.value)}
                                      className={`w-full bg-transparent text-xs focus:outline-none resize-none ml-8 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
                                    />
                                  </motion.div>
                                ))}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Completed Items Section */}
                  {(statusFilter === "Todos os Status" || statusFilter === "Completos") && (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col gap-4 mt-4 pt-10 border-t border-dashed border-white/10"
                    >
                      <div className="flex justify-between items-center px-2">
                        <label className="text-xs font-black uppercase tracking-[0.2em] opacity-80 text-emerald-500">
                          Itens Concluídos
                        </label>
                      </div>

                      <div className="flex flex-col gap-3">
                        <AnimatePresence mode="popLayout">
                          {[
                            ...shiftItems.fixed,
                            ...shiftItems.daily,
                            ...shiftItems.coverage
                          ].filter(it => it.completed).map((item) => (
                            <motion.div 
                              layout
                              layoutId={item.id}
                              key={item.id}
                              initial={{ opacity: 0, scale: 0.9, y: 10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.9, y: 10 }}
                              className={`p-4 rounded-2xl border transition-all ${
                                isDarkMode ? "bg-emerald-500/5 border-emerald-500/20 opacity-60" : "bg-emerald-50 border-emerald-100 opacity-60"
                              }`}
                            >
                              <div className="flex items-start gap-4 mb-3">
                                <div className="pt-1">
                                  <input 
                                    type="checkbox"
                                    checked={item.completed || false}
                                    onChange={(e) => updateShiftItem(item.id, "completed", e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                                  />
                                </div>
                                <div className="flex-1 grid grid-cols-12 gap-3">
                                  <div className="col-span-2">
                                    <input 
                                      placeholder="Turno"
                                      value={item.turno || ""}
                                      onChange={(e) => updateShiftItem(item.id, "turno", e.target.value)}
                                      className={`w-full bg-transparent text-xs font-bold uppercase tracking-wider focus:outline-none border-b line-through opacity-50 ${isDarkMode ? "border-white/10 focus:border-white/30" : "border-black/10 focus:border-black/30"}`}
                                    />
                                  </div>
                                  <div className="col-span-3">
                                    <input 
                                      placeholder="Analista"
                                      value={item.analista}
                                      onChange={(e) => updateShiftItem(item.id, "analista", e.target.value)}
                                      className={`w-full bg-transparent text-xs font-bold uppercase tracking-wider focus:outline-none border-b line-through opacity-50 ${isDarkMode ? "border-white/10 focus:border-white/30" : "border-black/10 focus:border-black/30"}`}
                                    />
                                  </div>
                                  <div className="col-span-3">
                                    <input 
                                      placeholder="Cidade"
                                      value={item.cidade || ""}
                                      onChange={(e) => updateShiftItem(item.id, "cidade", e.target.value)}
                                      className={`w-full bg-transparent text-xs font-bold uppercase tracking-wider focus:outline-none border-b line-through opacity-50 ${isDarkMode ? "border-white/10 focus:border-white/30" : "border-black/10 focus:border-black/30"}`}
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <input 
                                      placeholder="O.S"
                                      value={item.os}
                                      onChange={(e) => updateShiftItem(item.id, "os", e.target.value)}
                                      className={`w-full bg-transparent text-xs font-bold focus:outline-none border-b line-through opacity-50 ${isDarkMode ? "border-white/10 focus:border-white/30" : "border-black/10 focus:border-black/30"}`}
                                    />
                                  </div>
                                  <div className="col-span-2 flex justify-between items-center">
                                    <input 
                                      placeholder="Ciclo"
                                      value={item.ciclo}
                                      onChange={(e) => updateShiftItem(item.id, "ciclo", e.target.value)}
                                      className={`w-full bg-transparent text-xs font-bold focus:outline-none border-b line-through opacity-50 ${isDarkMode ? "border-white/10 focus:border-white/30" : "border-black/10 focus:border-black/30"}`}
                                    />
                                    <motion.button 
                                      whileHover={{ scale: 1.2, color: "#ef4444" }}
                                      whileTap={{ scale: 0.8 }}
                                      onClick={() => deleteShiftItem(item.id)}
                                      className="text-red-500/50 transition-colors ml-2"
                                    >
                                      <X size={14} />
                                    </motion.button>
                                  </div>
                                </div>
                              </div>
                              <textarea 
                                rows={2}
                                placeholder="Descritivo..."
                                value={item.descritivo}
                                onChange={(e) => updateShiftItem(item.id, "descritivo", e.target.value)}
                                className={`w-full bg-transparent text-xs focus:outline-none resize-none ml-8 line-through opacity-50 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
                              />
                            </motion.div>
                          ))}
                        </AnimatePresence>
                        {([...shiftItems.fixed, ...shiftItems.daily, ...shiftItems.coverage].filter(it => it.completed).length === 0) && (
                          <div className={`p-4 rounded-2xl border border-dashed text-center text-xs opacity-40 ${isDarkMode ? "border-white/10" : "border-black/10"}`}>
                            Nenhum item concluído ainda
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStatusFilter("Todos os Status")}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase ${statusFilter === "Todos os Status" ? "bg-[#FF5722] text-white" : isDarkMode ? "bg-white/5 text-gray-400" : "bg-black/5 text-gray-600"}`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setStatusFilter("Completos")}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase ${statusFilter === "Completos" ? "bg-emerald-500 text-white" : isDarkMode ? "bg-white/5 text-gray-400" : "bg-black/5 text-gray-600"}`}
                    >
                      Completos
                    </button>
                    <button
                      onClick={() => setStatusFilter("Pendentes")}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase ${statusFilter === "Pendentes" ? "bg-rose-500 text-white" : isDarkMode ? "bg-white/5 text-gray-400" : "bg-black/5 text-gray-600"}`}
                    >
                      Pendentes
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      if (confirm("Deseja realmente limpar todos os dados manuais deste turno? (Motoristas, KM e Observações)")) {
                        const batch = writeBatch(db);
                        const assignmentsRef = collection(db, `schedules/${selectedDate}_${selectedTurno}/assignments`);
                        const snapshot = await getDocs(assignmentsRef);
                        
                        snapshot.docs.forEach(doc => {
                          batch.update(doc.ref, {
                            manualDriver: deleteField(),
                            kmInicial: deleteField(),
                            kmFinal: deleteField(),
                            observacao: deleteField(),
                            isRede: deleteField(),
                            intervaloOk: false
                          });
                        });
                        
                        await batch.commit();
                        setIsShiftChangeModalOpen(false);
                        alert("Dados do turno limpos com sucesso!");
                      }
                    }}
                    className={`w-full py-4 rounded-2xl font-bold text-sm transition-all border ${
                      isDarkMode 
                        ? "border-white/10 hover:bg-white/5 text-white" 
                        : "border-black/10 hover:bg-black/5 text-black"
                    }`}
                  >
                    Limpar Dados Manuais
                  </button>
                  <button
                    onClick={() => setIsShiftChangeModalOpen(false)}
                    className="w-full py-4 rounded-2xl font-bold text-sm bg-[#FF5722] hover:bg-[#E64A19] text-white shadow-lg shadow-[#FF5722]/20 transition-all"
                  >
                    Finalizar e Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* KM Modal */}
      <AnimatePresence>
        {editingKM && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingKM(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`relative w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden ${
                isDarkMode ? "bg-[#141414] border border-white/10" : "bg-white border border-black/5"
              }`}
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#FF5722]/10 flex items-center justify-center">
                      <Gauge className="text-[#FF5722]" size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black tracking-tight">Registro de KM</h3>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                        {editingKM}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setEditingKM(null)}
                    className={`p-2 rounded-full transition-colors ${
                      isDarkMode ? "hover:bg-white/10 text-gray-400" : "hover:bg-black/5 text-gray-500"
                    }`}
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-500">KM Inicial</label>
                      <input 
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoFocus
                        value={data?.results.find(r => r.cidade === editingKM)?.kmInicial || ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          updateAssignment(editingKM, { kmInicial: val ? parseInt(val) : null });
                        }}
                        placeholder="0"
                        className={`w-full bg-transparent border-b-2 py-2 text-2xl font-black outline-none transition-colors ${
                          isDarkMode ? "border-white/10 focus:border-[#FF5722] text-white" : "border-black/10 focus:border-[#FF5722] text-black"
                        }`}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-500">KM Final</label>
                      <input 
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={data?.results.find(r => r.cidade === editingKM)?.kmFinal || ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          updateAssignment(editingKM, { kmFinal: val ? parseInt(val) : null });
                        }}
                        placeholder="0"
                        className={`w-full bg-transparent border-b-2 py-2 text-2xl font-black outline-none transition-colors ${
                          isDarkMode ? "border-white/10 focus:border-[#FF5722] text-white" : "border-black/10 focus:border-[#FF5722] text-black"
                        }`}
                      />
                    </div>
                  </div>

                  <div className={`p-6 rounded-3xl flex items-center justify-between ${
                    isDarkMode ? "bg-white/5" : "bg-black/5"
                  }`}>
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Total Percorrido</span>
                    <div className="text-right">
                      <span className={`text-3xl font-black tracking-tighter ${isDarkMode ? "text-white" : "text-black"}`}>
                        {(() => {
                          const res = data?.results.find(r => r.cidade === editingKM);
                          return (res?.kmFinal && res?.kmInicial) ? (res.kmFinal - res.kmInicial).toLocaleString() : "0";
                        })()}
                      </span>
                      <span className="ml-1 text-sm font-bold text-[#FF5722]">km</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setEditingKM(null)}
                    className="w-full bg-[#FF5722] hover:bg-[#E64A19] text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-[#FF5722]/20 transition-all active:scale-[0.98]"
                  >
                    Confirmar Registro
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

