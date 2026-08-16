import dotenv from 'dotenv'
dotenv.config({ path: '.env' })
async function main() {
  const { prisma } = await import('../src/lib/db')
  const rows = await prisma.archiveFolder.findMany({
    where: { OR: [{ fullPath: { contains: 'FPE-TEST' } }, { folderName: { contains: 'FPE-TEST' } }] },
    select: { id: true, fullPath: true, folderName: true, archiveKey: true },
  })
  console.log(rows)
}
main().catch(e => { console.error(e); process.exit(1) }).then(() => process.exit(0))
