import { PrismaClient } from "@prisma/client";
import type { RetentionAction, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

type DepartmentSeed = {
  code: string;
  name: string;
  nameEn: string;
  manager: string;
  parentCode?: string;
  sections: { code: string; name: string; nameEn: string; manager: string }[];
};

const DEPARTMENTS: DepartmentSeed[] = [
  {
    code: "EXEC",
    name: "الإدارة التنفيذية",
    nameEn: "Executive Management",
    manager: "د. سارة الحربي",
    sections: [
      { code: "EXEC-STR", name: "التخطيط الاستراتيجي", nameEn: "Strategic Planning", manager: "أ. خالد الدوسري" },
      { code: "EXEC-COR", name: "المراسلات الرسمية", nameEn: "Official Correspondence", manager: "أ. نورة العتيبي" },
    ],
  },
  {
    code: "HR",
    name: "الموارد البشرية",
    nameEn: "Human Resources",
    manager: "أ. ريم القحطاني",
    sections: [
      { code: "HR-TA", name: "التوظيف", nameEn: "Talent Acquisition", manager: "أ. فهد الشمري" },
      { code: "HR-OPS", name: "عمليات الموارد البشرية", nameEn: "HR Operations", manager: "أ. هند الزهراني" },
    ],
  },
  {
    code: "FIN",
    name: "الإدارة المالية",
    nameEn: "Finance",
    manager: "أ. عبدالله بن سعيد",
    sections: [
      { code: "FIN-ACC", name: "المحاسبة", nameEn: "Accounting", manager: "أ. محمد الغامدي" },
      { code: "FIN-BUD", name: "الميزانية", nameEn: "Budgeting", manager: "أ. ليلى المطيري" },
    ],
  },
  {
    code: "LEG",
    name: "الشؤون القانونية",
    nameEn: "Legal Affairs",
    manager: "أ. وليد العمري",
    sections: [
      { code: "LEG-CON", name: "العقود والاتفاقيات", nameEn: "Contracts", manager: "أ. ماجد السبيعي" },
      { code: "LEG-LIT", name: "القضايا والتحقيقات", nameEn: "Litigation", manager: "أ. شهد الرشيد" },
    ],
  },
  {
    code: "IT",
    name: "تقنية المعلومات",
    nameEn: "Information Technology",
    manager: "م. طلال الجهني",
    parentCode: "EXEC",
    sections: [
      { code: "IT-INF", name: "البنية التحتية", nameEn: "Infrastructure", manager: "م. ياسر الحميد" },
      { code: "IT-APP", name: "تطبيقات الأعمال", nameEn: "Business Applications", manager: "م. منى الأنصاري" },
    ],
  },
  {
    code: "ENG",
    name: "الهندسة",
    nameEn: "Engineering",
    manager: "م. سلطان البقمي",
    sections: [
      { code: "ENG-DES", name: "التصميم", nameEn: "Design", manager: "م. أحمد الزيد" },
      { code: "ENG-SUP", name: "الإشراف على المشاريع", nameEn: "Project Supervision", manager: "م. مشعل العسيري" },
    ],
  },
  {
    code: "PROC",
    name: "المشتريات",
    nameEn: "Procurement",
    manager: "أ. إبراهيم النعيمي",
    sections: [
      { code: "PROC-TEN", name: "المنافسات والعطاءات", nameEn: "Tendering", manager: "أ. سامي الحسن" },
      { code: "PROC-VEN", name: "إدارة الموردين", nameEn: "Vendor Management", manager: "أ. عبير المالكي" },
    ],
  },
  {
    code: "PMO",
    name: "إدارة المشاريع",
    nameEn: "Project Management Office",
    manager: "أ. لينا الشهري",
    sections: [
      { code: "PMO-PMO", name: "مكتب إدارة المشاريع", nameEn: "PMO", manager: "أ. ريان الحمد" },
      { code: "PMO-RISK", name: "إدارة المخاطر", nameEn: "Risk Management", manager: "أ. دانة الفهد" },
    ],
  },
];

const PROJECTS = [
  {
    code: "PRJ-2026-001",
    name: "رقمنة الأرشيف الورقي",
    nameEn: "Paper Archive Digitization",
    departmentCode: "EXEC",
    startDate: "2026-01-12",
    endDate: "2026-12-31",
  },
  {
    code: "PRJ-2026-002",
    name: "تطوير بوابة الخدمات",
    nameEn: "Services Portal Upgrade",
    departmentCode: "IT",
    startDate: "2026-03-01",
    endDate: "2026-09-30",
  },
  {
    code: "PRJ-2026-003",
    name: "مراجعة سياسات الاحتفاظ",
    nameEn: "Retention Policy Review",
    departmentCode: "LEG",
    startDate: "2026-02-15",
    endDate: "2026-08-15",
  },
  {
    code: "PRJ-2026-004",
    name: "توحيد سجلات الموظفين",
    nameEn: "Employee Records Consolidation",
    departmentCode: "HR",
    startDate: "2026-04-01",
    endDate: "2026-11-30",
  },
];

const EMPLOYEES = [
  {
    empNo: "EDAS-1001",
    name: "سارة الحربي",
    nameEn: "Sarah Al-Harbi",
    jobTitle: "مدير عام",
    jobTitleEn: "Director General",
    departmentCode: "EXEC",
    sectionCode: "EXEC-STR",
  },
  {
    empNo: "EDAS-1002",
    name: "خالد الدوسري",
    nameEn: "Khalid Al-Dosari",
    jobTitle: "مدير التخطيط",
    jobTitleEn: "Planning Manager",
    departmentCode: "EXEC",
    sectionCode: "EXEC-STR",
  },
  {
    empNo: "EDAS-1003",
    name: "نورة العتيبي",
    nameEn: "Noura Al-Otaibi",
    jobTitle: "أخصائي مراسلات",
    jobTitleEn: "Correspondence Specialist",
    departmentCode: "EXEC",
    sectionCode: "EXEC-COR",
  },
  {
    empNo: "EDAS-1101",
    name: "ريم القحطاني",
    nameEn: "Reem Al-Qahtani",
    jobTitle: "مدير الموارد البشرية",
    jobTitleEn: "HR Manager",
    departmentCode: "HR",
    sectionCode: "HR-OPS",
  },
  {
    empNo: "EDAS-1102",
    name: "فهد الشمري",
    nameEn: "Fahd Al-Shammari",
    jobTitle: "مسؤول التوظيف",
    jobTitleEn: "Recruitment Officer",
    departmentCode: "HR",
    sectionCode: "HR-TA",
  },
  {
    empNo: "EDAS-1103",
    name: "هند الزهراني",
    nameEn: "Hind Al-Zahrani",
    jobTitle: "أخصائي عمليات",
    jobTitleEn: "Operations Specialist",
    departmentCode: "HR",
    sectionCode: "HR-OPS",
  },
  {
    empNo: "EDAS-1201",
    name: "عبدالله بن سعيد",
    nameEn: "Abdullah Bin Saeed",
    jobTitle: "مدير مالي",
    jobTitleEn: "Finance Manager",
    departmentCode: "FIN",
    sectionCode: "FIN-ACC",
  },
  {
    empNo: "EDAS-1202",
    name: "محمد الغامدي",
    nameEn: "Mohammed Al-Ghamdi",
    jobTitle: "محاسب",
    jobTitleEn: "Accountant",
    departmentCode: "FIN",
    sectionCode: "FIN-ACC",
  },
  {
    empNo: "EDAS-1203",
    name: "ليلى المطيري",
    nameEn: "Layla Al-Mutairi",
    jobTitle: "محلل ميزانية",
    jobTitleEn: "Budget Analyst",
    departmentCode: "FIN",
    sectionCode: "FIN-BUD",
  },
  {
    empNo: "EDAS-1301",
    name: "وليد العمري",
    nameEn: "Waleed Al-Omari",
    jobTitle: "المستشار القانوني",
    jobTitleEn: "Legal Counsel",
    departmentCode: "LEG",
    sectionCode: "LEG-CON",
  },
  {
    empNo: "EDAS-1302",
    name: "شهد الرشيد",
    nameEn: "Shahad Al-Rashid",
    jobTitle: "باحث قانوني",
    jobTitleEn: "Legal Researcher",
    departmentCode: "LEG",
    sectionCode: "LEG-LIT",
  },
  {
    empNo: "EDAS-1401",
    name: "طلال الجهني",
    nameEn: "Talal Al-Juhani",
    jobTitle: "مدير تقنية المعلومات",
    jobTitleEn: "IT Manager",
    departmentCode: "IT",
    sectionCode: "IT-INF",
  },
  {
    empNo: "EDAS-1402",
    name: "ياسر الحميد",
    nameEn: "Yasser Al-Humaid",
    jobTitle: "مهندس شبكات",
    jobTitleEn: "Network Engineer",
    departmentCode: "IT",
    sectionCode: "IT-INF",
  },
  {
    empNo: "EDAS-1403",
    name: "منى الأنصاري",
    nameEn: "Mona Al-Ansari",
    jobTitle: "محلل نظم",
    jobTitleEn: "Systems Analyst",
    departmentCode: "IT",
    sectionCode: "IT-APP",
  },
  {
    empNo: "EDAS-1501",
    name: "سلطان البقمي",
    nameEn: "Sultan Al-Baqami",
    jobTitle: "مدير الهندسة",
    jobTitleEn: "Engineering Manager",
    departmentCode: "ENG",
    sectionCode: "ENG-SUP",
  },
  {
    empNo: "EDAS-1502",
    name: "أحمد الزيد",
    nameEn: "Ahmed Al-Zaid",
    jobTitle: "مهندس تصميم",
    jobTitleEn: "Design Engineer",
    departmentCode: "ENG",
    sectionCode: "ENG-DES",
  },
  {
    empNo: "EDAS-1601",
    name: "إبراهيم النعيمي",
    nameEn: "Ibrahim Al-Nuaimi",
    jobTitle: "مدير المشتريات",
    jobTitleEn: "Procurement Manager",
    departmentCode: "PROC",
    sectionCode: "PROC-TEN",
  },
  {
    empNo: "EDAS-1602",
    name: "عبير المالكي",
    nameEn: "Abeer Al-Malki",
    jobTitle: "أخصائي موردين",
    jobTitleEn: "Vendor Specialist",
    departmentCode: "PROC",
    sectionCode: "PROC-VEN",
  },
  {
    empNo: "EDAS-1701",
    name: "لينا الشهري",
    nameEn: "Lina Al-Shehri",
    jobTitle: "مدير مكتب المشاريع",
    jobTitleEn: "PMO Manager",
    departmentCode: "PMO",
    sectionCode: "PMO-PMO",
  },
  {
    empNo: "EDAS-1702",
    name: "دانة الفهد",
    nameEn: "Dana Al-Fahd",
    jobTitle: "أخصائي مخاطر",
    jobTitleEn: "Risk Specialist",
    departmentCode: "PMO",
    sectionCode: "PMO-RISK",
  },
];

const GROUPS = [
  {
    name: "لجنة الوثائق والأرشفة",
    nameEn: "Records & Archiving Committee",
    desc: "مراجعة سياسات الوثائق والاحتفاظ والإشراف على خطة الأرشفة.",
    scope: "عام",
    type: "dept",
  },
  {
    name: "فريق الأرشفة المركزي",
    nameEn: "Central Archiving Team",
    desc: "تنفيذ عمليات الفهرسة والتصنيف والتحويل إلى أرشيف نهائي.",
    scope: "الإدارة التنفيذية",
    type: "functional",
  },
  {
    name: "مراجعو الجودة",
    nameEn: "Quality Reviewers",
    desc: "تدقيق جودة الملفات والبيانات الوصفية قبل الاعتماد.",
    scope: "عام",
    type: "functional",
  },
  {
    name: "أمن المعلومات",
    nameEn: "Information Security",
    desc: "ضبط تصنيف الوثائق الحساسة وصلاحيات الوصول.",
    scope: "تقنية المعلومات",
    type: "functional",
  },
];

const FOLDER_TREE = [
  {
    dept: "EXEC",
    name: "الوثائق الرسمية",
    nameEn: "Official Documents",
    children: [
      { name: "القرارات", nameEn: "Decisions" },
      { name: "المراسلات", nameEn: "Correspondence" },
    ],
  },
  {
    dept: "HR",
    name: "ملفات الموظفين",
    nameEn: "Employee Files",
    children: [
      { name: "التوظيف", nameEn: "Recruitment" },
      { name: "التقييم الوظيفي", nameEn: "Performance Reviews" },
    ],
  },
  {
    dept: "FIN",
    name: "الوثائق المالية",
    nameEn: "Financial Records",
    children: [
      { name: "الفواتير", nameEn: "Invoices" },
      { name: "الميزانيات", nameEn: "Budgets" },
    ],
  },
  { dept: "LEG", name: "العقود والاتفاقيات", nameEn: "Contracts & Agreements", children: [] },
  { dept: "IT", name: "الوثائق التقنية", nameEn: "Technical Records", children: [] },
  { dept: "ENG", name: "مخططات المشاريع", nameEn: "Project Drawings", children: [] },
  { dept: "PROC", name: "ملفات المنافسات", nameEn: "Tender Files", children: [] },
  { dept: "PMO", name: "مستندات المشاريع", nameEn: "Project Documents", children: [] },
];

const RETENTION_POLICIES: {
  name: string;
  description: string;
  category: string;
  legalBasis: string;
  retentionMonths: number;
  action: RetentionAction;
  departmentCode: string | null;
}[] = [
  {
    name: "سياسة الوثائق المالية",
    description: "الاحتفاظ بالوثائق المالية والمحاسبية وفق متطلبات المراجعة.",
    category: "finreport",
    legalBasis: "نظام المراجعة المالية",
    retentionMonths: 120,
    action: "ARCHIVE",
    departmentCode: "FIN",
  },
  {
    name: "سياسة سجلات الموظفين",
    description: "الاحتفاظ بسجلات الموظفين وملفاتهم الوظيفية.",
    category: "empfile",
    legalBasis: "نظام العمل",
    retentionMonths: 60,
    action: "REVIEW",
    departmentCode: "HR",
  },
  {
    name: "سياسة العقود والاتفاقيات",
    description: "الاحتفاظ بالعقود والاتفاقيات بعد انتهاء مدتها التعاقدية.",
    category: "contract",
    legalBasis: "نظام المعاملات المدنية",
    retentionMonths: 120,
    action: "ARCHIVE",
    departmentCode: "LEG",
  },
  {
    name: "سياسة الوثائق التقنية",
    description: "الاحتفاظ بوثائق الأنظمة والدعم الفني ثم إتلافها.",
    category: "policy",
    legalBasis: "سياسة أمن المعلومات",
    retentionMonths: 36,
    action: "DESTROY",
    departmentCode: "IT",
  },
  {
    name: "سياسة المراسلات الرسمية",
    description: "مراجعة المراسلات الرسمية الصادرة والواردة قبل الإتلاف.",
    category: "incoming",
    legalBasis: "لائحة المراسلات الرسمية",
    retentionMonths: 60,
    action: "REVIEW",
    departmentCode: null,
  },
];

const APPROVAL_CHAINS: { name: string; description: string; steps: { role: UserRole; name: string }[] }[] = [
  {
    name: "سلسلة اعتماد الوثائق الداخلية",
    description: "مراجعة أولية ثم اعتماد مدير الإدارة ثم حفظ الوثيقة في الأرشيف.",
    steps: [
      { role: "SUPERVISOR", name: "المراجعة الأولية" },
      { role: "DEPT_MANAGER", name: "اعتماد مدير الإدارة" },
      { role: "ARCHIVIST", name: "تسجيل الوثيقة في الأرشيف" },
    ],
  },
  {
    name: "سلسلة اعتماد الوثائق السرية",
    description: "اعتماد مدير الإدارة ثم اعتماد نهائي من مدير النظام.",
    steps: [
      { role: "DEPT_MANAGER", name: "اعتماد مدير الإدارة" },
      { role: "SYSTEM_ADMIN", name: "الاعتماد النهائي" },
    ],
  },
];

const SETTINGS: Record<string, string> = {
  orgName: "هيئة المؤسسات الحكومية",
  orgNameEn: "Government Entities Authority",
  defaultLang: "ar",
  timezone: "Asia/Riyadh",
  maxFileSize: "50",
  draftDays: "30",
  numberingTemplate: "EDAS-{YEAR}{SEQ:6}",
  allowedTypes: "PDF, DOCX, XLSX, PPTX, PNG, JPG, DWG, TXT",
  retentionDefault: "5",
  idleTimeout: "30",
  maxSession: "8",
  concurrentSessions: "3",
  failedAttempts: "5",
  lockDuration: "30",
  minPassword: "12",
  passwordExpiry: "90",
};

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

async function seedDepartments() {
  const ids = new Map<string, string>();
  const sectionIds = new Map<string, string>();

  for (const [index, dept] of DEPARTMENTS.entries()) {
    const parentId = dept.parentCode ? (ids.get(dept.parentCode) ?? null) : null;
    const record = await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name, nameEn: dept.nameEn, manager: dept.manager, order: index, parentId },
      create: { code: dept.code, name: dept.name, nameEn: dept.nameEn, manager: dept.manager, order: index, parentId },
      select: { id: true },
    });
    ids.set(dept.code, record.id);

    for (const [sectionIndex, section] of dept.sections.entries()) {
      const sectionRecord = await prisma.section.upsert({
        where: { code: section.code },
        update: {
          name: section.name,
          nameEn: section.nameEn,
          manager: section.manager,
          order: sectionIndex,
          departmentId: record.id,
        },
        create: {
          code: section.code,
          name: section.name,
          nameEn: section.nameEn,
          manager: section.manager,
          order: sectionIndex,
          departmentId: record.id,
        },
        select: { id: true },
      });
      sectionIds.set(section.code, sectionRecord.id);
    }
  }

  return { departmentIds: ids, sectionIds };
}

async function seedEmployees(departmentIds: Map<string, string>, sectionIds: Map<string, string>) {
  for (const employee of EMPLOYEES) {
    const data = {
      name: employee.name,
      nameEn: employee.nameEn,
      jobTitle: employee.jobTitle,
      jobTitleEn: employee.jobTitleEn,
      email: `${employee.empNo.toLowerCase()}@edas.local`,
      departmentId: departmentIds.get(employee.departmentCode) ?? null,
      sectionId: sectionIds.get(employee.sectionCode) ?? null,
    };
    await prisma.employee.upsert({
      where: { empNo: employee.empNo },
      update: data,
      create: { empNo: employee.empNo, ...data },
    });
  }
}

async function seedProjects(departmentIds: Map<string, string>) {
  for (const project of PROJECTS) {
    const departmentId = departmentIds.get(project.departmentCode) ?? null;
    await prisma.project.upsert({
      where: { code: project.code },
      update: {
        name: project.name,
        nameEn: project.nameEn,
        departmentId,
        startDate: toDate(project.startDate),
        endDate: toDate(project.endDate),
      },
      create: {
        code: project.code,
        name: project.name,
        nameEn: project.nameEn,
        departmentId,
        startDate: toDate(project.startDate),
        endDate: toDate(project.endDate),
      },
    });
  }
}

async function seedGroups() {
  for (const group of GROUPS) {
    const existing = await prisma.group.findFirst({ where: { name: group.name }, select: { id: true } });
    if (existing) {
      await prisma.group.update({
        where: { id: existing.id },
        data: { nameEn: group.nameEn, desc: group.desc, scope: group.scope, type: group.type },
      });
      continue;
    }
    await prisma.group.create({
      data: { name: group.name, nameEn: group.nameEn, desc: group.desc, scope: group.scope, type: group.type },
    });
  }
}

async function ensureFolder(input: {
  name: string;
  nameEn: string;
  departmentId: string | null;
  parent: { id: string; path: string } | null;
}) {
  const existing = await prisma.folder.findFirst({
    where: { name: input.name, departmentId: input.departmentId, parentId: input.parent?.id ?? null },
    select: { id: true, path: true },
  });

  const id =
    existing?.id ??
    (
      await prisma.folder.create({
        data: {
          name: input.name,
          nameEn: input.nameEn,
          type: "DEPARTMENT",
          scope: "DEPARTMENT",
          departmentId: input.departmentId,
          parentId: input.parent?.id ?? null,
          path: "/",
          aclInherit: true,
        },
        select: { id: true },
      })
    ).id;

  const path = `${input.parent?.path ?? "/"}${id}/`;
  if (existing?.path !== path) await prisma.folder.update({ where: { id }, data: { path } });

  return { id, path };
}

async function seedFolders(departmentIds: Map<string, string>) {
  for (const node of FOLDER_TREE) {
    const departmentId = departmentIds.get(node.dept) ?? null;
    const root = await ensureFolder({ name: node.name, nameEn: node.nameEn, departmentId, parent: null });
    for (const child of node.children) {
      await ensureFolder({ name: child.name, nameEn: child.nameEn, departmentId, parent: root });
    }
  }
}

async function seedRetentionPolicies(departmentIds: Map<string, string>) {
  for (const policy of RETENTION_POLICIES) {
    const existing = await prisma.retentionPolicy.findFirst({ where: { name: policy.name }, select: { id: true } });
    const departmentId = policy.departmentCode ? (departmentIds.get(policy.departmentCode) ?? null) : null;
    if (existing) {
      await prisma.retentionPolicy.update({
        where: { id: existing.id },
        data: {
          description: policy.description,
          category: policy.category,
          legalBasis: policy.legalBasis,
          retentionMonths: policy.retentionMonths,
          action: policy.action,
          departmentId,
        },
      });
      continue;
    }
    await prisma.retentionPolicy.create({
      data: {
        name: policy.name,
        description: policy.description,
        category: policy.category,
        legalBasis: policy.legalBasis,
        retentionMonths: policy.retentionMonths,
        action: policy.action,
        departmentId,
      },
    });
  }
}

async function seedApprovalChains() {
  for (const chain of APPROVAL_CHAINS) {
    const existing = await prisma.approvalChain.findFirst({ where: { name: chain.name }, select: { id: true } });
    const chainId =
      existing?.id ??
      (
        await prisma.approvalChain.create({
          data: { name: chain.name, description: chain.description },
          select: { id: true },
        })
      ).id;

    if (existing) {
      await prisma.approvalChain.update({
        where: { id: chainId },
        data: { description: chain.description, isActive: true },
      });
    }

    for (const [index, step] of chain.steps.entries()) {
      const order = index + 1;
      await prisma.approvalStep.upsert({
        where: { chainId_order: { chainId, order } },
        update: { role: step.role, name: step.name },
        create: { chainId, order, role: step.role, name: step.name },
      });
    }
  }
}

async function seedSettings() {
  for (const [key, value] of Object.entries(SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
}

async function main() {
  const { departmentIds, sectionIds } = await seedDepartments();
  await seedEmployees(departmentIds, sectionIds);
  await seedProjects(departmentIds);
  await seedGroups();
  await seedFolders(departmentIds);
  await seedRetentionPolicies(departmentIds);
  await seedApprovalChains();
  await seedSettings();

  const [departments, sections, employees, projects, groups, folders, policies, chains, settings] = await Promise.all([
    prisma.department.count(),
    prisma.section.count(),
    prisma.employee.count(),
    prisma.project.count(),
    prisma.group.count(),
    prisma.folder.count(),
    prisma.retentionPolicy.count(),
    prisma.approvalChain.count(),
    prisma.setting.count(),
  ]);

  console.log(
    `seed complete: ${departments} departments, ${sections} sections, ${employees} employees, ${projects} projects, ` +
      `${groups} groups, ${folders} folders, ${policies} retention policies, ${chains} approval chains, ${settings} settings`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
