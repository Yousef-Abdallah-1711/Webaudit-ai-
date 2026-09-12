-- AlterTable
ALTER TABLE "AiInvocation" ADD COLUMN     "promptVersion" TEXT;

-- AlterTable
ALTER TABLE "Receipt" ALTER COLUMN "id" DROP DEFAULT;
