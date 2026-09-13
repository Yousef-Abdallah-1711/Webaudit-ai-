CREATE TABLE "EmailSendAttempt" (
  "id" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "messageType" TEXT NOT NULL,
  "succeeded" BOOLEAN NOT NULL,
  "providerError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailSendAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailSendAttempt_recipient_createdAt_idx"
  ON "EmailSendAttempt"("recipient", "createdAt");
CREATE INDEX "EmailSendAttempt_messageType_createdAt_idx"
  ON "EmailSendAttempt"("messageType", "createdAt");
