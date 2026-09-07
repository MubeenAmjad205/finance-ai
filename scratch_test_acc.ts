import { PrismaClient } from '@prisma/client/edge';
import { withAccelerate } from '@prisma/extension-accelerate';

const prisma = new PrismaClient({
  datasourceUrl: "prisma://accelerate.prisma-data.net/?api_key=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqd3RfaWQiOjEsInNlY3VyZV9rZXkiOiJza18tU1A4alAyLXJOSjB2OGxaWjRfeU0iLCJhcGlfa2V5IjoiMDFNMVlLM1JNQTVUMTdUVzFYUjFaTlZEUVEiLCJ0ZW5hbnRfaWQiOiI3NjlkYTNjMWEwOTE2NjM5M2M0N2U5OWQwZjFkNzEyYzM2N2E1NGVkODFkZDRmY2U5MTFlM2M4NzU5YWI5NjNlIiwiaW50ZXJuYWxfc2VjcmV0IjoiNDFlYWQzOTUtODNlMy00YzdiLTg0MmQtNjllZDE4OGU4YmEzIn0.ywAoVSSH30L-yd-O32f951IIh7shbTd7eW5Fngnaqzw"
}).$extends(withAccelerate());

async function main() {
  console.log("Fetching accounts via Prisma Accelerate...");
  const accounts = await prisma.account.findMany();
  console.log("Accounts found:", accounts);
}

main().catch(console.error);
