require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const Foto = mongoose.connection.db.collection('fotos');
  
  const lotes = ['Lote_01', 'Lote_02'];
  
  for (const lote of lotes) {
    console.log(`Verificando ${lote}...`);
    const count = await Foto.countDocuments({ lote });
    console.log(`  Encontradas: ${count} fotos`);
    
    if (count > 0) {
      console.log(`  Removendo...`);
      const resultado = await Foto.deleteMany({ lote });
      console.log(`  Removidas: ${resultado.deletedCount} fotos`);
    } else {
      console.log(`  Nenhuma foto encontrada`);
    }
  }
  
  console.log('Concluido');
  await mongoose.disconnect();
  process.exit(0);
})();
