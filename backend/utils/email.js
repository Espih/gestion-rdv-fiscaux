// backend/utils/email.js
module.exports.sendEmail = async (to, subject, text) => {
    console.log(`📩 Email simulé -> À: ${to}, Sujet: ${subject}, Message: ${text}`);
    return true;
  };
  