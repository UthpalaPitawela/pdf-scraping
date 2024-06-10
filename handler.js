const puppeteer = require("puppeteer-core");
const { chromium: playwright } = require("playwright-core");
const chromium = require("@sparticuz/chromium");
const pdf = require("pdf-parse");
const fs = require("fs");

exports.handler = async () => {
  const isLocal = process.env.AWS_EXECUTION_ENV === undefined;

  const browser = isLocal
    ? // if we are running locally, use the puppeteer that is installed in the node_modules folder
      await playwright.launch()
    : // if we are running in AWS, download and use a compatible version of chromium at runtime
      await playwright.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(
          "https://github.com/Sparticuz/chromium/releases/download/v119.0.2/chromium-v119.0.2-pack.tar"
        ),
        headless: chromium.headless,
      });

  // Open a new page / tab in the browser.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(
    "https://mfa.gov.lk/certificates-of-births-marriages-and-deaths/?fbclid=IwZXh0bgNhZW0CMTAAAR3ZbfM0rBySINGG72RXC5V-Srbcu5J--LUq9T2O9yl0CN01kI98Z7BcPzQ_aem_AUyU9oLD20bXRp_swaIzh2I9sxSCRAdAD71WRSPbF4dtwncgP-r3IYSFsxEOaSfQzvWsnnBWUuHeOP00d67C7xTD"
  );
  // Wait for the download event and click on a link to download the PDF file
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "click here" }).click(),
  ]);

  // Use the suggested filename from the download event to save the file
  const suggestedFileName = download.suggestedFilename();
  const filePath = "ExportData/" + suggestedFileName;
  await download.saveAs(filePath);

  // Use the 'pdf-parse' module to extract the text from the PDF file
  const dataBuffer = fs.readFileSync("./ExportData/Consular-Guidlines-New.pdf");

  //add stream to form data
  //Here url should be S3 pre signed url
  const bodyFormData = new FormData();
  bodyFormData.append('pdfExtract', dataBuffer); 
  const response = await putToS3("url",bodyFormData);
  console.log('response', response);
  if (response.ok) {
    const text = await response.text();
    console.log("text", text);
  } else {
    const error = await response.json();
    console.log("error", error);
  }

  // Download the pdf as a text file
  await pdf(dataBuffer).then(function (data) {
    fs.writeFileSync("./ExportData/actual.txt", data.text);
  });

  await page.waitForTimeout(10000);
  await browser.close();
};

// The below endpoints related to add data to s3 via pre signed url. 
// Here url should be the one which can retrieve the S3 pre signed url
const getPreSignedUrl = async () => {
  return await fetch('url' , {
      method: "POST",
      body: {
          "uploadType": "DOCUMENT",
          "mimeType": "application/pdf"
      }
  });
}

//The below code related to add data to the s3 bucket using a presigned url
const putToS3 = async (url, data) => {
  return  await  fetch(url, {method: "PUT", body: data, headers: {
      'Content-Type': 'application/pdf'
  }});

}

