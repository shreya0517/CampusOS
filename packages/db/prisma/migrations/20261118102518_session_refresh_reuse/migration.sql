-- AlterTable
ALTER TABLE "AuthSession" ADD COLUMN     "previousRefreshTokenHash" TEXT,
ADD COLUMN     "rotatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_previousRefreshTokenHash_key" ON "AuthSession"("previousRefreshTokenHash");
