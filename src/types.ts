/* Core types shared across the portal. Schema mirrors the question-bank JSON files exactly. */
namespace App {
  export interface Mem {
    ti: string;
    tip: string;
    link: string;
  }

  export interface QuestionBase {
    id: string;
    ch: number;
    topic: string;
    m: number;          // marks
    d: "EASY" | "MEDIUM" | "HARD";
    q: string;
    trend: string;     // past attempt / RTP / MTP reference (pattern-based, honest)
    prob: "HIGH" | "MEDIUM" | "LOW";
    probWhy: string;   // why this may appear in Nov 2026
    mem: Mem;
    sec?: string;      // mock section label (extension, optional)
    caseRef?: string;  // shared case-stem id (extension, optional)
  }

  export interface Mcq extends QuestionBase {
    o: string[];
    a: number;         // index of correct option
    why: string;
    stem?: string;     // case-stem text for linked case MCQs
  }

  export interface Descr extends QuestionBase {
    parts?: string[];
    ans: string;
    scheme: string;
    keyPoints?: string[];
  }

  export type AnyQuestion = Mcq | Descr;

  export function isMcq(x: AnyQuestion): x is Mcq {
    return Array.isArray((x as Mcq).o);
  }

  export interface DatasetMeta {
    id: string;
    paper: string;      // P1 | P2 | P3
    attempt: string;    // NOV-2026
    kind: "prediction" | "core" | "mock" | "rapid" | "chapter";
    category: string;
    file: string;       // ./data/p1-nov26-most-repeated.json
    jsvar: string;      // p1Nov26MostRepeated
    title: string;
    description: string;
    count: number;
    mcqCount: number;
    descriptiveCount: number;
    coverage: string;
    chapters: number[];
    durationMinutes: number;
    difficulty: string;
    high: number;
    medium: number;
    low: number;
  }

  export interface DatasetFile {
    meta: DatasetMeta;
    questions: AnyQuestion[];
  }

  export interface PaperInfo {
    id: string;
    no: number;
    title: string;
    shortTitle: string;
    chapterCount: number;
    modules: number;
    chapters: { no: number; name: string; module: number }[];
  }

  export interface AttemptInfo {
    id: string;         // NOV-2026
    label: string;      // November 2026
    tagline: string;
    current: boolean;
  }

  export interface Manifest {
    version: number;
    notice: string;
    attempts: AttemptInfo[];
    papers: PaperInfo[];
    datasets: DatasetMeta[];
  }

  /* -------- persistent session / progress -------- */
  export interface ExamSession {
    datasetId: string;
    paper: string;
    attempt: string;
    mode: "exam" | "practice";
    startedAt: number;
    deadline: number | null;         // epoch ms; null in practice mode
    answers: { [qid: string]: string | number };   // mcq: option index, desc: text
    marks: { [qid: string]: number };              // descriptive self-marks (result stage)
    marked: string[];                              // marked-for-review ids
    current: number;
    total: number;
    warned: Record<string, boolean>;
    submitted?: boolean;
    submittedAt?: number;
  }

  export interface ResultRecord {
    key: string;
    datasetId: string;
    paper: string;
    attempt: string;
    title: string;
    mode: "exam" | "practice";
    startedAt: number;
    submittedAt: number;
    usedSeconds: number;
    totalQuestions: number;
    attempted: number;
    correct: number;
    incorrect: number;
    unattempted: number;
    accuracy: number;
    mcqScore: number;
    descScore: number;
    score: number;
    maxScore: number;
    autoScored: boolean;
    perQ: { id: string; your: string | number | null; correct: number | null; awarded: number; max: number; kind: "mcq" | "desc"; prob: string }[];
  }

  export interface ResumeInfo {
    datasetId: string;
    title: string;
    paper: string;
    current: number;
    total: number;
    answered: number;
  }
}
