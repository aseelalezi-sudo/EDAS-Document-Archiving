import { createHash } from "node:crypto";

const API_URL = (process.env.EDAS_API_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");
const ISSUER = (process.env.EDAS_OIDC_ISSUER ?? "http://localhost:8080/realms/edas").replace(/\/$/, "");
const CLIENT_ID = process.env.EDAS_OIDC_CLIENT_ID ?? "edas-web";
const USERNAME = process.env.EDAS_SEED_USER ?? "admin";
const PASSWORD = process.env.EDAS_SEED_PASSWORD ?? "admin";
const MARKER = "demo-seed";

const DEMO_DOCUMENTS = [
  {
    folder: "Contracts & Agreements",
    title: "عقد صيانة شبكة الاتصالات 2026",
    titleEn: "Telecommunications Network Maintenance Contract 2026",
    description:
      "عقد سنوي لصيانة شبكة الاتصالات والمعدات الطرفية مع مزوّد الخدمة، يشمل اتفاقية مستوى الخدمة زمن الاستجابة وغرامات التأخير وبنود السرية.",
    category: "contract",
    classification: "CONFIDENTIAL",
    status: "APPROVED",
    tags: ["contract", "maintenance", "network", "sla"],
    mime: "application/pdf",
  },
  {
    folder: "Contracts & Agreements",
    title: "عقد توريد أجهزة الحاسب المكتبية",
    titleEn: "Desktop Computers Supply Contract",
    description: "عقد توريد وتركيب 120 جهاز حاسب مكتبي مع ضمان ثلاث سنوات وخدمة دعم ميداني.",
    category: "contract",
    classification: "INTERNAL",
    status: "IN_REVIEW",
    tags: ["contract", "procurement", "hardware"],
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    folder: "Invoices",
    title: "فاتورة خدمات الاستضافة السحابية",
    titleEn: "Cloud Hosting Services Invoice",
    description: "فاتورة ربعية لخدمات الاستضافة السحابية والنسخ الاحتياطي الخارجي، مستحقة السداد خلال ثلاثين يوماً.",
    category: "incoming",
    classification: "PUBLIC",
    status: "IN_REVIEW",
    tags: ["invoice", "cloud", "hosting"],
    mime: "application/pdf",
  },
  {
    folder: "Budgets",
    title: "ميزانية السنة المالية 2027",
    titleEn: "Fiscal Year 2027 Budget",
    description: "مسودة ميزانية السنة المالية القادمة مع توزيع بنود الإنفاق التشغيلي والرأسمالي على الإدارات.",
    category: "finreport",
    classification: "CONFIDENTIAL",
    status: "DRAFT",
    tags: ["budget", "finance", "2027"],
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    folder: "Financial Records",
    title: "التقرير المالي للربع الثاني 2026",
    titleEn: "Q2 2026 Financial Report",
    description: "تقرير مالي ربعي يعرض الإيرادات والمصروفات والتدفقات النقدية مقارنة بالخطة المعتمدة.",
    category: "finreport",
    classification: "INTERNAL",
    status: "APPROVED",
    tags: ["report", "finance", "quarterly"],
    mime: "application/pdf",
  },
  {
    folder: "Employee Files",
    title: "ملف الموظف — أحمد البلوي",
    titleEn: "Employee File — Ahmed Albalawi",
    description: "ملف موظف يحتوي العقد الوظيفي والشهادات الأكاديمية وتقييمات الأداء السابقة.",
    category: "empfile",
    classification: "SECRET",
    status: "ARCHIVED",
    tags: ["employee", "hr", "personnel"],
    mime: "application/pdf",
  },
  {
    folder: "Performance Reviews",
    title: "تقييم الأداء السنوي 2026",
    titleEn: "Annual Performance Review 2026",
    description: "نموذج تقييم الأداء السنوي لموظفي إدارة الموارد البشرية مع مؤشرات الأداء الرئيسية.",
    category: "empfile",
    classification: "INTERNAL",
    status: "DRAFT",
    tags: ["performance", "hr", "review"],
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    folder: "Recruitment",
    title: "إعلان وظيفة مهندس شبكات",
    titleEn: "Network Engineer Vacancy Announcement",
    description: "إعلان توظيف لمهندس شبكات أول يشمل الوصف الوظيفي والمؤهلات المطلوبة ومدة التقديم.",
    category: "incoming",
    classification: "PUBLIC",
    status: "APPROVED",
    tags: ["recruitment", "vacancy", "network"],
    mime: "application/pdf",
  },
  {
    folder: "Technical Records",
    title: "سياسة أمن المعلومات",
    titleEn: "Information Security Policy",
    description: "سياسة أمن المعلومات المعتمدة وتشمل تصنيف البيانات وضوابط الوصول وإدارة الحوادث والاستجابة للاختراقات.",
    category: "policy",
    classification: "PUBLIC",
    status: "APPROVED",
    tags: ["policy", "security", "compliance"],
    mime: "application/pdf",
  },
  {
    folder: "Technical Records",
    title: "دليل الاستجابة للحوادث السيبرانية",
    titleEn: "Cyber Incident Response Runbook",
    description: "دليل تشغيلي لخطوات الاستجابة للحوادث السيبرانية وأدوار فريق الاستجابة وقنوات التصعيد.",
    category: "policy",
    classification: "CONFIDENTIAL",
    status: "IN_REVIEW",
    tags: ["security", "incident", "runbook"],
    mime: "text/plain",
  },
  {
    folder: "Project Drawings",
    title: "مخططات مشروع ألفا التقنية",
    titleEn: "Project Alpha Technical Drawings",
    description: "حزمة مخططات هندسية لمشروع ألفا تشمل المخططات المعمارية والكهربائية والميكانيكية بصيغة DWG.",
    category: "drawing",
    classification: "INTERNAL",
    status: "APPROVED",
    tags: ["drawing", "engineering", "project-alpha"],
    mime: "application/acad",
  },
  {
    folder: "Project Documents",
    title: "محضر اجتماع لجنة المشاريع",
    titleEn: "Projects Committee Meeting Minutes",
    description: "محضر اجتماع لجنة المشاريع الدوري ومناقشة نسب الإنجاز والمخاطر والمعوقات والقرارات المتخذة.",
    category: "minutes",
    classification: "INTERNAL",
    status: "DRAFT",
    tags: ["minutes", "meeting", "pmo"],
    mime: "text/plain",
  },
  {
    folder: "Tender Files",
    title: "ملف مناقصة توريد المعدات المكتبية",
    titleEn: "Office Equipment Tender File",
    description: "ملف مناقصة يشمل كراسة الشروط والمواصفات ومعايير التقييم وجدول الكميات.",
    category: "po",
    classification: "INTERNAL",
    status: "IN_REVIEW",
    tags: ["tender", "procurement", "specification"],
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    folder: "Official Documents",
    title: "قرار إداري بتشكيل لجنة الحوكمة",
    titleEn: "Administrative Decision Forming the Governance Committee",
    description: "قرار إداري بتشكيل لجنة الحوكمة والمخاطر وتحديد مهامها ومدة عملها وآلية اجتماعاتها.",
    category: "policy",
    classification: "PUBLIC",
    status: "APPROVED",
    tags: ["decision", "governance", "committee"],
    mime: "application/pdf",
  },
  {
    folder: "Correspondence",
    title: "خطاب رسمي إلى وزارة المالية",
    titleEn: "Official Letter to the Ministry of Finance",
    description: "خطاب صادر إلى وزارة المالية بخصوص اعتماد ميزانية المشاريع الرأسمالية للربع القادم.",
    category: "outgoing",
    classification: "INTERNAL",
    status: "APPROVED",
    tags: ["correspondence", "ministry", "finance"],
    mime: "application/pdf",
  },
  {
    folder: "Decisions",
    title: "قرار ترقية موظفي الإدارة المالية",
    titleEn: "Finance Department Staff Promotion Decision",
    description: "قرار إداري بترقية مجموعة من موظفي الإدارة المالية اعتباراً من بداية السنة المالية.",
    category: "policy",
    classification: "CONFIDENTIAL",
    status: "ARCHIVED",
    tags: ["decision", "promotion", "hr"],
    mime: "application/pdf",
  },
  {
    folder: "Technical Records",
    title: "سجل الأصول التقنية ومخزون الأجهزة",
    titleEn: "IT Asset Register and Hardware Inventory",
    description: "سجل تحديثات الأصول التقنية يشمل أجهزة الخوادم ومعدات الشبكة وأجهزة المستخدمين وأعمار الاستبدال.",
    category: "finreport",
    classification: "INTERNAL",
    status: "ARCHIVED",
    tags: ["assets", "inventory", "it"],
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    folder: "Project Documents",
    title: "خطة إدارة مخاطر المشروع",
    titleEn: "Project Risk Management Plan",
    description: "خطة إدارة المخاطر لمشروع التحول الرقمي وتشمل سجل المخاطر ومصفوفة الاحتمالية والأثر وخطط التخفيف.",
    category: "deliverable",
    classification: "CONFIDENTIAL",
    status: "APPROVED",
    tags: ["risk", "project", "plan"],
    mime: "application/pdf",
  },
  {
    folder: "Employee Files",
    title: "شهادة تدريب الأمن السيبراني",
    titleEn: "Cybersecurity Awareness Training Certificate",
    description: "شهادة إتمام برنامج التوعية بالأمن السيبراني لموظفي الإدارات التشغيلية.",
    category: "empfile",
    classification: "INTERNAL",
    status: "ARCHIVED",
    tags: ["training", "certificate", "security"],
    mime: "image/png",
  },
  {
    folder: "Correspondence",
    title: "خطاب وارد من الجهة الرقابية",
    titleEn: "Incoming Letter from the Regulatory Authority",
    description: "خطاب وارد من الجهة الرقابية يطلب تقرير الامتثال السنوي وخطة معالجة الملاحظات.",
    category: "incoming",
    classification: "CONFIDENTIAL",
    status: "IN_REVIEW",
    tags: ["correspondence", "compliance", "regulator"],
    mime: "application/pdf",
  },
];

function fail(message) {
  console.error(`✖ ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

async function login() {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: CLIENT_ID,
    username: USERNAME,
    password: PASSWORD,
    scope: "openid profile email",
  });
  const response = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const detail = await response.text();
    fail(`Keycloak login failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const payload = await response.json();
  if (!payload.access_token) fail("Keycloak did not return an access token");
  return payload.access_token;
}

function createClient(token) {
  return async function call(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const error = parsed?.error;
      fail(`${options.method ?? "GET"} ${path} → ${response.status} ${error?.code ?? ""} ${error?.message ?? text.slice(0, 200)}`);
    }
    return parsed.data;
  };
}

function escapePdf(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(title, lines) {
  const text = [title, "", ...lines].map((line, index) => `BT /F1 12 Tf 56 ${780 - index * 18} Td (${escapePdf(line)}) Tj ET`).join("\n");
  const stream = `${text}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAF0lEQVQoz2NkYPjPQAxgYiASjCocVRgqAABTEgP/2m4mNwAAAABJRU5ErkJggg==",
  "base64",
);

function buildFile(spec) {
  const lines = [
    `Document: ${spec.titleEn}`,
    `Category: ${spec.category}`,
    `Classification: ${spec.classification}`,
    `Status: ${spec.status}`,
    `Tags: ${spec.tags.join(", ")}`,
    "",
    spec.description,
  ];

  if (spec.mime === "image/png") return PNG_1X1;
  if (spec.mime === "application/pdf")
    return buildPdf(spec.titleEn, lines.map((line) => line.replace(/[^\x20-\x7e]/g, "")).filter(Boolean));
  return Buffer.from(lines.join("\n"), "utf8");
}

function extensionFor(mime) {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "application/acad") return "dwg";
  if (mime === "text/plain") return "txt";
  if (mime.includes("spreadsheetml")) return "xlsx";
  if (mime.includes("wordprocessingml")) return "docx";
  return "bin";
}

async function listAllDocuments(call) {
  const items = [];
  for (let page = 1; page <= 50; page += 1) {
    const result = await call(`/documents?page=${page}&pageSize=100`);
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.meta.total) break;
  }
  return items;
}

// Documents reach their lifecycle state only through the paths the product exposes:
// the archive transition (PATCH /documents/:id) and the approval workflow (POST /approvals).
async function driveStatus(call, documentId, status) {
  if (status === "DRAFT") return "DRAFT";

  if (status === "ARCHIVED") {
    await call(`/documents/${documentId}`, { method: "PATCH", body: { transition: "ARCHIVE" } });
    return "ARCHIVED";
  }

  let instance = await call("/approvals", {
    method: "POST",
    body: { documentId, comment: `Demo workflow ${status === "IN_REVIEW" ? "left pending for review" : "towards approval"}` },
  });
  if (status === "IN_REVIEW") return "IN_REVIEW";

  for (let guard = 0; instance.status === "PENDING" && guard < 10; guard += 1) {
    instance = await call(`/approvals/${instance.id}/decide`, { method: "POST", body: { decision: "APPROVED", comment: "Demo approval" } });
  }
  return instance.status;
}

async function seedOne(call, folders, spec) {
  const folder = folders.get(spec.folder);
  if (!folder) fail(`Folder not found: ${spec.folder}`);

  const fileName = `${spec.titleEn.replace(/[^\w.-]+/g, "-").slice(0, 40)}.${extensionFor(spec.mime)}`;
  const content = buildFile(spec);
  const checksumSha256 = createHash("sha256").update(content).digest("hex");

  const presigned = await call("/files/presign-upload", {
    method: "POST",
    body: { fileName, mimeType: spec.mime, sizeBytes: content.length },
  });

  const upload = await fetch(presigned.url, {
    method: presigned.method ?? "PUT",
    headers: { "content-type": spec.mime },
    body: content,
  });
  if (!upload.ok) fail(`Upload to storage failed (${upload.status}) for ${fileName}`);

  const file = await call("/files", {
    method: "POST",
    body: {
      storageKey: presigned.storageKey,
      originalName: fileName,
      mimeType: spec.mime,
      sizeBytes: content.length,
      checksumSha256,
    },
  });

  const document = await call("/documents", {
    method: "POST",
    body: {
      title: spec.title,
      titleEn: spec.titleEn,
      description: spec.description,
      category: spec.category,
      classification: spec.classification,
      folderId: folder.id,
      departmentId: folder.departmentId ?? undefined,
      tags: [...spec.tags, MARKER],
      fileId: file.id,
      comment: "Demo seed document created through the real upload path",
    },
  });

  const reached = await driveStatus(call, document.id, spec.status);

  return { document, reached };
}

async function main() {
  const clean = process.argv.includes("--clean");
  const token = await login();
  const call = createClient(token);

  const tree = await call("/folders/tree");
  const folders = new Map(tree.items.map((folder) => [folder.nameEn, folder]));

  const existing = await listAllDocuments(call);
  const alreadySeeded = existing.filter((document) => (document.tags ?? []).includes(MARKER));

  if (clean) {
    if (alreadySeeded.length === 0) {
      console.log("No demo documents to remove.");
      return;
    }
    for (const document of alreadySeeded) {
      await call(`/documents/${document.id}`, { method: "DELETE" });
      await call(`/documents/${document.id}/purge`, { method: "DELETE" });
    }
    console.log(`Removed ${alreadySeeded.length} demo documents.`);
    return;
  }

  const existingTitles = new Set(existing.map((document) => document.title));
  const pending = DEMO_DOCUMENTS.filter((spec) => !existingTitles.has(spec.title));

  if (pending.length === 0) {
    console.log(`All ${DEMO_DOCUMENTS.length} demo documents already exist (${alreadySeeded.length} tagged "${MARKER}").`);
    return;
  }

  let created = 0;
  for (const spec of pending) {
    const { reached } = await seedOne(call, folders, spec);
    created += 1;
    console.log(`✔ ${reached.padEnd(9)} ${spec.classification.padEnd(12)} ${spec.title}`);
  }

  console.log(`\nCreated ${created} demo documents (skipped ${DEMO_DOCUMENTS.length - pending.length} existing).`);
  console.log(`Tag "${MARKER}" marks demo data; remove it with: npm run demo:seed -- --clean`);
}

main().catch((error) => {
  if (!process.exitCode) {
    console.error(error);
    process.exitCode = 1;
  }
});
