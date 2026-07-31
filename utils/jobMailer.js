 


const transporter = require("./transporter");

const sendJobEmail = async ({
    to,
  
    company,
    attachments = []
}) => {

    return await transporter.sendMail({

        from: `"Abdelbasset El Hajiri" <${process.env.EMAIL_USER} >`,
        //from: `"Abdelbasset El Hajiri" <abdelbassetelhajiri02@gmail.com>`,
        //to,
        to: "abdelbasset.elhajiri1@gmail.com", // ضع بريدك

        subject: "Job Application",

        html: `
            <p>Dear Hiring Team at <strong>${company}</strong>,</p>

            <p>
            Me dirijo a ustedes con gran interés para presentar mi candidatura al puesto de Ayudante de Cocina / Agente de Restauración dentro de su establecimiento.
            </p>

            <p>
            Cuento con formación especializada en hostelería y restauración, además de experiencia profesional en Newrest.
            </p>

            <p>
            Me considero una persona responsable, disciplinada y acostumbrada al trabajo bajo presión.
            </p>

            <p>
            Adjunto mi currículum vitae para su consideración y quedo a su disposición para una entrevista.
            </p>

            <br><br>

            Kind regards,<br>
            Abdelbasset El Hajiri
        `,

        attachments

    });

};

module.exports = sendJobEmail;