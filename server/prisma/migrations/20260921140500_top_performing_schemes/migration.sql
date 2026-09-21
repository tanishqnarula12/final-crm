-- CreateTable
CREATE TABLE "scheme_perf_uploads" (
    "id" TEXT NOT NULL,
    "reportingMonth" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "supersededAt" TIMESTAMP(3),
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "fileDataUrl" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheme_perf_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheme_perf_categories" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sheetIndex" INTEGER NOT NULL DEFAULT 0,
    "avgMedian" DOUBLE PRECISION,
    "avgMedianSource" TEXT,
    "rawHeaders" JSONB NOT NULL DEFAULT '[]',
    "rawRows" JSONB NOT NULL DEFAULT '[]',
    "headerRowIndex" INTEGER NOT NULL DEFAULT 0,
    "schemeCol" INTEGER,
    "medianCol" INTEGER,

    CONSTRAINT "scheme_perf_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheme_perf_schemes" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "reportingMonth" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "schemeName" TEXT NOT NULL,
    "median" DOUBLE PRECISION,
    "avgMedian" DOUBLE PRECISION,
    "difference" DOUBLE PRECISION,
    "result" TEXT NOT NULL DEFAULT 'NOT_AVAILABLE',
    "rowIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scheme_perf_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheme_perf_uploads_reportingMonth_version_idx" ON "scheme_perf_uploads"("reportingMonth", "version");

-- CreateIndex
CREATE INDEX "scheme_perf_uploads_deletedAt_reportingMonth_idx" ON "scheme_perf_uploads"("deletedAt", "reportingMonth");

-- CreateIndex
CREATE INDEX "scheme_perf_categories_uploadId_idx" ON "scheme_perf_categories"("uploadId");

-- CreateIndex
CREATE INDEX "scheme_perf_schemes_categoryId_idx" ON "scheme_perf_schemes"("categoryId");

-- CreateIndex
CREATE INDEX "scheme_perf_schemes_uploadId_result_idx" ON "scheme_perf_schemes"("uploadId", "result");

-- CreateIndex
CREATE INDEX "scheme_perf_schemes_schemeName_idx" ON "scheme_perf_schemes"("schemeName");

-- AddForeignKey
ALTER TABLE "scheme_perf_categories" ADD CONSTRAINT "scheme_perf_categories_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "scheme_perf_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_perf_schemes" ADD CONSTRAINT "scheme_perf_schemes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "scheme_perf_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheme_perf_schemes" ADD CONSTRAINT "scheme_perf_schemes_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "scheme_perf_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

