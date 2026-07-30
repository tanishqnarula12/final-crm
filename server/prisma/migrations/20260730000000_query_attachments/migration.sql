-- Files attached to a query (PDFs, images, …). Stored in their own table, not
-- in Query.payload: queries persist via a bulk PUT of the whole array, so a
-- base64 blob in the payload would be re-uploaded on every save and would
-- eventually exceed the request body limit.
-- CreateTable
CREATE TABLE "query_attachments" (
    "id" TEXT NOT NULL,
    "queryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "size" INTEGER NOT NULL DEFAULT 0,
    "dataUrl" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "query_attachments_queryId_idx" ON "query_attachments"("queryId");

-- AddForeignKey
ALTER TABLE "query_attachments" ADD CONSTRAINT "query_attachments_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
