-- Add the section anchor used by FolderScope.SECTION while keeping legacy folders valid.
ALTER TABLE "Folder" ADD COLUMN "sectionId" UUID;

CREATE INDEX "Folder_departmentId_idx" ON "Folder"("departmentId");
CREATE INDEX "Folder_sectionId_idx" ON "Folder"("sectionId");
CREATE INDEX "Folder_ownerId_idx" ON "Folder"("ownerId");

ALTER TABLE "Folder"
  ADD CONSTRAINT "Folder_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "Section"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
