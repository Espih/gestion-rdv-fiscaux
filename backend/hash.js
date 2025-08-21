const bcrypt = require('bcrypt');

const motDePasse = "123456789";
const saltRounds = 12;

bcrypt.hash(motDePasse, saltRounds, (err, hash) => {
  if (err) console.error(err);
  else console.log("Hash généré :", hash);
});
