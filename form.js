let edu = 0;
let skill = 0;
let work = 0;
let interest = 0;
let lang = 0;

function adder(event, element) {
  if (event.key === 'Enter') {
    if (element == 'skill') {
      $('#add_skill').click();
      document.getElementsByClassName('skill')[$('.skill').length - 1].focus();
    }
    else if (element == 'hobby') {
      $('#add_interest').click();
      document.getElementsByClassName('hobby')[$('.hobby').length - 1].focus();
    }
    else {
      $('#add_lang').click();
      document.getElementsByClassName('lang')[$('.lang').length - 1].focus();
    }
  }
}

//This is for color pelette

$(document).ready(function () {
  $('.one').css("border", "3px solid white");
  $('.pelement').click(function () {
    $('.pelement').css("border", "3px solid transparent");
    $(this).css("border", "3px solid white");
    $('.left_side').css("background-color", $(this).css("background-color"));
  })
});

//  **********    **********    **********    **********    **********

function toggChk(el) {
  let ele = $(el).parent('div').parent('div').prev().find("input")[0];
  ele.disabled = !ele.disabled;
  if ($(el).is(':checked'))
    $(ele).parent('div').css({ 'display': 'none' });
  else
    $(ele).parent('div').css({ 'display': 'block' });
}

function validate_chg_color(el) {
  let isValid = true;

  if ($(el).hasClass('end_date')) {
    let chk_pre = $(el).parent().next('div').find('input')[0].checked;
    if (chk_pre)
      return true;
  }
  if ($(el).attr('type') == 'checkbox') {// console.log($(el).attr('type'));
  }
  else if ($.trim($(el).val()) == '' || $.trim($(el).val()) == 'Select level') {
    isValid = false;
    $(el).css({ "border": "1.5px solid red" });
  }
  else {
    $(el).css({ "border": "1.5px solid rgb(206, 212, 218)" });
  }
  return isValid;
}

//  **********    **********    **********    **********    **********


//  **********    **********  Form - 1  Validation  **********    **********    **********

function validate_form1(btn) {
  let finalValid = true;
  let isValid = true;
  // console.log(document.getElementsByClassName('imgContainer')[0]);
  let img_div = document.getElementsByClassName('imgContainer')[0];
  if ($('#inpImg').val() == "") { validate_chg_color(img_div); isValid = false; finalValid = false; }
  $('#form1').find('select').each(function () {
    if ($(this).attr('city') == 'city' || $(this).attr('country') == 'country' || $(this).attr('state') == 'state') { isValid = validate_chg_color(this); if (!isValid) { finalValid = false; } }
  });
  $('#form1').find('input').each(function () {
    if ($(this).attr('id') == 'linkedIn' || $(this).attr('id') == 'website') { }
    else {
      isValid = validate_chg_color(this);
      if (!isValid) { finalValid = false; }
    }
  });
  if (isValid == false) {
    // btn.preventDefault();
  }
  return finalValid;
}

//  **********    **********    **********    **********    **********



//  **********  ********** Work Experience  **********  **********

function updateWork() {
  for (let i = 0; i < $('#accordionWork .accordion-item').length; i++) {
    let a = ($(`#accordionWork .accordion-item:nth-child(${i + 1}) .job_title`).val().trim() == '') ? 'Work Experience' : $(`#accordionWork .accordion-item:nth-child(${i + 1}) .job_title`).val().trim();

    let c = ($(`#accordionWork .accordion-item:nth-child(${i + 1}) .company_name`).val().trim() == '') ? '' : ' at ' + $(`#accordionWork .accordion-item:nth-child(${i + 1}) .company_name`).val().trim();

    $(`#accordionWork .accordion-item:nth-child(${i + 1}) .accordion-button`).html(a + c);
  }
}

function wmakeVisible() {
  $("#accordionWork .accordion-header").css("display", "block");
  updateWork();
}

function delWork2(event) {
  event.preventDefault();
  if ($("#accordionWork .accordion-item").length > 1) {
    wmakeVisible();
    event.target.parentElement.parentElement.parentElement.remove();
  }
  event.stopPropagation();
}

$('.fc2').click(function () {
  work = 1;
  $('.fc2').off('click');
})
let workAdder = $("#accordionWork").html();
let workCounter = 1;

$("#add_work").click(function (e) {
  let isValid = true;
  let finalValid = true;
  $("#accordionWork .accordion-item:last-child").find("input").each(function () { isValid = validate_chg_color(this); if (!isValid) { finalValid = false; } });

  if (!finalValid) {
    e.preventDefault();
  }
  else {
    updateWork();
    workCounter++;
    if ($("#accordionWork .accordion-item").length > 0) {
      $("#accordionWork .accordion-header").css("display", "block");
      let count = $("#accordionWork .accordion-item").length;
      if (document.getElementById("accordionWork").getElementsByClassName("accordion-item")[count - 1].getElementsByClassName("accordion-collapse")[0].classList.contains("show")) {
        document.getElementById("accordionWork").getElementsByClassName("accordion-item")[count - 1].getElementsByClassName("accordion-button")[0].click();
      }
    }
    $("#accordionWork").append(workAdder);
    $("#accordionWork .accordion-header").last().attr("id", "wheading" + workCounter);
    $("#accordionWork .accordion-collapse").last().attr("aria-labelledby", "wheading" + workCounter);
    $("#accordionWork .accordion-collapse").last().attr("id", "wcollapse" + workCounter);
    $("#accordionWork .accordion-button").last().attr("data-bs-target", "#wcollapse" + workCounter);
    $("#accordionWork .accordion-button").last().attr("aria-controls", "wcollapse" + workCounter);
  }
});



//  **********    **********    **********    **********    **********




//  **********  ********** Education and Qualifications **********  **********

function updateEdu() {
  for (let i = 0; i < $('#accordionEdu .accordion-item').length; i++) {

    let a = ($(`#accordionEdu .accordion-item:nth-child(${i + 1}) .degree`).val().trim() == '') ? 'Education' : $(`#accordionEdu .accordion-item:nth-child(${i + 1}) .degree`).val().trim();

    let c = ($(`#accordionEdu .accordion-item:nth-child(${i + 1}) .school`).val().trim() == '') ? '' : ' from ' + $(`#accordionEdu .accordion-item:nth-child(${i + 1}) .school`).val().trim();

    $(`#accordionEdu .accordion-item:nth-child(${i + 1}) .accordion-button`).html(a + c);
  }
}

function emakeVisible() {
  $("#accordionEdu .accordion-header").css("display", "block");
  updateEdu();
}

function delEdu2(event) {
  event.preventDefault();
  if ($("#accordionEdu .accordion-item").length > 1) {
    emakeVisible();
    event.target.parentElement.parentElement.parentElement.remove();
  }
  event.stopPropagation();
}


$('.fc1').click(function () {
  edu = 1;
  $('.fc1').off('click');
});

let eduAdder = $("#accordionEdu").html();
let eduCounter = 1;

$("#add_edu").click(function (e) {
  let isValid = true;
  let finalValid = true;
  $('#accordionEdu .accordion-item:last-child').find('input').each(function () { isValid = validate_chg_color(this); if (!isValid) { finalValid = false; } });

  if (!finalValid) {
    e.preventDefault();
  }
  else {
    updateEdu();
    eduCounter++;
    if ($("#accordionEdu .accordion-item").length > 0) {
      $("#accordionEdu .accordion-header").css("display", "block");
      let count = $("#accordionEdu .accordion-item").length;
      if (document.getElementById("accordionEdu").getElementsByClassName("accordion-item")[count - 1].getElementsByClassName("accordion-collapse")[0].classList.contains("show")) {
        document.getElementById("accordionEdu").getElementsByClassName("accordion-item")[count - 1].getElementsByClassName("accordion-button")[0].click();
      }
    }
    $("#accordionEdu").append(eduAdder);
    $("#accordionEdu .accordion-header").last().attr("id", "eheading" + eduCounter);
    $("#accordionEdu .accordion-collapse").last().attr("aria-labelledby", "eheading" + eduCounter);
    $("#accordionEdu .accordion-collapse").last().attr("id", "ecollapse" + eduCounter);
    $("#accordionEdu .accordion-button").last().attr("data-bs-target", "#ecollapse" + eduCounter);
    $("#accordionEdu .accordion-button").last().attr("aria-controls", "ecollapse" + eduCounter);
  }
});


//  **********    **********    **********    **********    **********




//  **********  ********** Skills **********  **********

function updateSkill() {
  for (let i = 0; i < $('#accordionSkill .accordion-item').length; i++) {

    let a = ($(`#accordionSkill .accordion-item:nth-child(${i + 1}) .skill`).val().trim() == '') ? 'Skill' : $(`#accordionSkill .accordion-item:nth-child(${i + 1}) .skill`).val().trim();

    $(`#accordionSkill .accordion-item:nth-child(${i + 1}) .accordion-button`).html(a);
  }
}

function smakeVisible() {
  $("#accordionSkill .accordion-header").css("display", "block");
  updateSkill();
}

function delSkill2(event) {
  event.preventDefault();
  if ($("#accordionSkill .accordion-item").length > 1) {
    smakeVisible();
    event.target.parentElement.parentElement.parentElement.remove();
  }
  event.stopPropagation();
}

$('.fc3').click(function () {
  skill = 1;
  $('.fc3').off('click');
})
let skillAdder = $("#accordionSkill").html();
let skillCounter = 1;

$("#add_skill").click(function (e) {
  let isValid = true;
  let finalValid = true;
  $("#accordionSkill .accordion-item:last-child").find("input, select").each(function () { isValid = validate_chg_color(this); if (!isValid) { finalValid = false; } });
  if (!finalValid) {
    e.preventDefault();
  }
  else {
    updateSkill();
    skillCounter++;
    if ($("#accordionSkill .accordion-item").length > 0) {
      $("#accordionSkill .accordion-header").css("display", "block");
      let count = $("#accordionSkill .accordion-item").length;
      if (document.getElementById("accordionSkill").getElementsByClassName("accordion-item")[count - 1].getElementsByClassName("accordion-collapse")[0].classList.contains("show")) {
        document.getElementById("accordionSkill").getElementsByClassName("accordion-item")[count - 1].getElementsByClassName("accordion-button")[0].click();
      }
    }
    $("#accordionSkill").append(skillAdder);
    $("#accordionSkill .accordion-header").last().attr("id", "sheading" + skillCounter);
    $("#accordionSkill .accordion-collapse").last().attr("aria-labelledby", "sheading" + skillCounter);
    $("#accordionSkill .accordion-collapse").last().attr("id", "scollapse" + skillCounter);
    $("#accordionSkill .accordion-button").last().attr("data-bs-target", "#scollapse" + skillCounter);
    $("#accordionSkill .accordion-button").last().attr("aria-controls", "scollapse" + skillCounter);
  }
});

$(".fc3").mouseleave(function () {
  if (skill == 0) { return; }
  let timer = window.setTimeout(function () {
    smakeVisible();
    let count = $("#accordionSkill .accordion-item").length;
    for (let i = 0; i < count; i++) {
      if (document.getElementById("accordionSkill").getElementsByClassName("accordion-item")[i].getElementsByClassName("accordion-collapse")[0].classList.contains("show")) {
        document.getElementById("accordionSkill").getElementsByClassName("accordion-button")[i].click();
      }
    }
  }, 5000);
  $(".fc3").mouseenter(function () {
    window.clearTimeout(timer);
    $(".fc3").unbind('mouseenter');
  });
});

//  **********    **********    **********    **********    **********




//  **********  ********** Interests  **********  **********

function updateInterest() {
  for (let i = 0; i < $('#accordionInt .accordion-item').length; i++) {

    let a = ($(`#accordionInt .accordion-item:nth-child(${i + 1}) .hobby`).val().trim() == '') ? 'Hobby' : $(`#accordionInt .accordion-item:nth-child(${i + 1}) .hobby`).val().trim();

    $(`#accordionInt .accordion-item:nth-child(${i + 1}) .accordion-button`).html(a);
  }
}

function imakeVisible() {
  $("#accordionInt .accordion-header").css("display", "block");
  updateInterest();
}

function delInt2(event) {
  event.preventDefault();
  if ($("#accordionInt .accordion-item").length > 1) {
    imakeVisible();
    event.target.parentElement.parentElement.parentElement.remove();
  }
  event.stopPropagation();
}

$('.fc4').click(function () {
  interest = 1;
  $('.fc4').off('click');
})
let interestAdder = $("#accordionInt").html();
let interestCounter = 1;

$("#add_interest").click(function () {
  let isValid = true;
  let finalValid = true;
  $("#accordionInt .accordion-item:last-child").find('input').each(function () { isValid = validate_chg_color(this); if (!isValid) { finalValid = false; } });
  if (!finalValid) {
    e.preventDefault();
  }
  else {
    updateInterest();
    interestCounter++;
    if ($("#accordionInt .accordion-item").length > 0) {
      $("#accordionInt .accordion-header").css("display", "block");
      let count = $("#accordionInt .accordion-item").length;
      if (document.getElementById("accordionInt").getElementsByClassName("accordion-item")[count - 1].getElementsByClassName("accordion-collapse")[0].classList.contains("show")) {
        document.getElementById("accordionInt").getElementsByClassName("accordion-item")[count - 1].getElementsByClassName("accordion-button")[0].click();
      }
    }
    $("#accordionInt").append(interestAdder);
    $("#accordionInt .accordion-header").last().attr("id", "iheading" + interestCounter);
    $("#accordionInt .accordion-collapse").last().attr("aria-labelledby", "iheading" + interestCounter);
    $("#accordionInt .accordion-collapse").last().attr("id", "icollapse" + interestCounter);
    $("#accordionInt .accordion-button").last().attr("data-bs-target", "#icollapse" + interestCounter);
    $("#accordionInt .accordion-button").last().attr("aria-controls", "icollapse" + interestCounter);
  }
});

$(".fc4").mouseleave(function () {
  if (interest == 0) { return; }
  let timer = window.setTimeout(function () {
    imakeVisible();
    let count = $("#accordionInt .accordion-item").length;
    for (let i = 0; i < count; i++) {
      if (document.getElementById("accordionInt").getElementsByClassName("accordion-item")[i].getElementsByClassName("accordion-collapse")[0].classList.contains("show")) {
        document.getElementById("accordionInt").getElementsByClassName("accordion-button")[i].click();
      }
    }
  }, 5000);
  $(".fc4").mouseenter(function () {
    window.clearTimeout(timer);
    $(".fc4").unbind('mouseenter');
  });
});

//  **********    **********    **********    **********    **********

// ********************** *********************** Languages ********************* ************************

function updateLang() {
  for (let i = 0; i < $('#accordionLang .accordion-item').length; i++) {

    let a = ($(`#accordionLang .accordion-item:nth-child(${i + 1}) .lang`).val().trim() == '') ? 'Language' : $(`#accordionLang .accordion-item:nth-child(${i + 1}) .lang`).val().trim();

    $(`#accordionLang .accordion-item:nth-child(${i + 1}) .accordion-button`).html(a);
  }
}

function lmakeVisible() {
  $("#accordionLang .accordion-header").css("display", "block");
  updateLang();
}

function delLang2(event) {
  event.preventDefault();
  if ($("#accordionLang .accordion-item").length > 1) {
    lmakeVisible();
    event.target.parentElement.parentElement.parentElement.remove();
  }
  event.stopPropagation();
}

$('.fc6').click(function () {
  lang = 1;
  $('.fc6').off('click');
})
let langAdder = $("#accordionLang").html();
let langCounter = 1;

$("#add_lang").click(function (e) {
  let isValid = true;
  let finalValid = true;
  $("#accordionLang .accordion-item:last-child").find('input').each(function () { isValid = validate_chg_color(this); if (!isValid) { finalValid = false; } });
  if (!finalValid) {
    e.preventDefault();
  }
  else {
    updateLang();
    langCounter++;
    if ($("#accordionLang .accordion-item").length > 0) {
      $("#accordionLang .accordion-header").css("display", "block");
      let count = $("#accordionLang .accordion-item").length;
      if (document.getElementById("accordionLang").getElementsByClassName("accordion-item")[count - 1].getElementsByClassName("accordion-collapse")[0].classList.contains("show")) {
        document.getElementById("accordionLang").getElementsByClassName("accordion-item")[count - 1].getElementsByClassName("accordion-button")[0].click();
      }
    }
    $("#accordionLang").append(langAdder);
    $("#accordionLang .accordion-header").last().attr("id", "lheading" + langCounter);
    $("#accordionLang .accordion-collapse").last().attr("aria-labelledby", "lheading" + langCounter);
    $("#accordionLang .accordion-collapse").last().attr("id", "lcollapse" + langCounter);
    $("#accordionLang .accordion-button").last().attr("data-bs-target", "#lcollapse" + langCounter);
    $("#accordionLang .accordion-button").last().attr("aria-controls", "lcollapse" + langCounter);
  }
});




//  **********    **********    Country, state and city API   **********    **********

// NOTE: The previous implementation used universal-tutorial.com to fetch countries and placed country_name
// as the <option> value. The CountryStateCity API expects ISO2 country codes (e.g. "IN") in the URL paths,
// and the universal-tutorial endpoint used in the browser was blocked by CORS. A safe production approach is to
// host a small server-side proxy that keeps the API key secret and forwards requests to the external API.
// Example server endpoints (recommended):
// GET  /api/locations/countries            -> returns countries (from https://api.countrystatecity.in/v1/countries)
// GET  /api/locations/states/:countryIso2  -> returns states for the given ISO2 country code
// GET  /api/locations/cities/:countryIso2/:stateIso2 -> returns cities
// The client then calls these local endpoints (no CORS issues and API key stays secret).

// Client-side fallback (for quick testing only): call CountryStateCity API directly. DO NOT expose a real key in
// client JS in production. Replace YOUR_API_KEY with a valid key only for local testing.

$(document).ready(function () {
  getCountries();
  $('#country').change(getStates);
  $('#state').change(getCities);
});

function getCountries() {
  // Keep this declaration for compatibility with an older malformed comment line.
  var n;
  // Prefer calling a local proxy: uncomment and use the proxy when available
  // const url = '/api/locations/countries';
n  // Fallback: direct CountryStateCity API call (requires API key and may be blocked by CORS if the provider forbids it)
  // Prefer the local proxy to avoid CORS and to keep the API key secret
  const url = '/api/locations/countries';
  $.ajax({
      type: 'GET',
      url: url,
      headers: {
        // If using direct provider call, set the API key here (only for local testing)
        // 'X-CSCAPI-KEY': 'YOUR_API_KEY'
      },
      success: function (data) {
        $('#country').empty().append('<option value="">Select Country</option>');
        // CountryStateCity returns objects with iso2 and name; store iso2 as value so states/cities calls work
        data.forEach((ele) => {
          $('#country').append(`<option value="${ele.iso2}">${ele.name}</option>`);
        });
      },
      error: function (error) {
        const message = error.responseJSON?.error || `Request failed (${error.status})`;
        console.error('Error fetching countries:', message);
        $('#country').empty().append(`<option value="">${message}</option>`);
      }
  });
}

function getStates() {
  const countryIso = $('#country').val();
  $('#state').empty().append('<option value="">Select State</option>').prop('disabled', true);
  $('#city').empty().append('<option value="">Select City</option>').prop('disabled', true);
  if (!countryIso) return;
  // Prefer local proxy endpoint when available, otherwise call provider directly (may be blocked by CORS)
  // Prefer the local proxy endpoint
  const url = `/api/locations/states/${encodeURIComponent(countryIso)}`;
  $.ajax({
      type: 'GET',
      url: url,
      headers: {
        // 'X-CSCAPI-KEY': 'YOUR_API_KEY' // only for direct testing; do NOT commit or use in production    
      },
      success: function (data) {
        $('#state').empty().append('<option value="">Select State</option>');
        data.forEach((ele) => {
          // state iso2 is used as value so cities endpoint works
          $('#state').append(`<option value="${ele.iso2}">${ele.name}</option>`);
        });
        $('#city').empty().append('<option value="">Select City</option>').prop('disabled', true);
        $('#state').prop('disabled', false);
      },
      error: function (error) {
        const message = error.responseJSON?.error || error.responseJSON?.details || `Request failed (${error.status})`;
        console.error('Error fetching states:', message);
        $('#state').empty().append(`<option value="">${message}</option>`);
      }
  });
}

function getCities() {
  const countryIso = $('#country').val();
  const stateIso = $('#state').val();
  $('#city').empty().append('<option value="">Select City</option>').prop('disabled', true);
  if (!countryIso || !stateIso) return;
  // Prefer the local proxy endpoint
  const url = `/api/locations/cities/${encodeURIComponent(countryIso)}/${encodeURIComponent(stateIso)}`;
  $.ajax({
      type: 'GET',
      url: url,
      headers: {
        // 'X-CSCAPI-KEY': 'YOUR_API_KEY' // only for direct testing
      },
      success: function (data) {
        $('#city').empty().append('<option value="">Select City</option>');
        data.forEach((ele) => {
          $('#city').append(`<option value="${ele.name}">${ele.name}</option>`);
        });
        $('#city').prop('disabled', false);
      },
      error: function (error) {
        const message = error.responseJSON?.error || `Request failed (${error.status})`;
        console.error('Error fetching cities:', message);
        $('#city').empty().append(`<option value="">${message}</option>`);
      }
  });
}

//  **********    **********    Profile Images    **********    **********

$('.imgContainer').click(function () {
  $('#inpImg').click();
})
$('#inpImg').change(function () {
  const file = this.files[0];
  if (file) {
    const reader = new FileReader();
    $('#previewText').css('display', 'none');
    $('.imgContainer').css('border', 'none');
    $('#image').css('display', 'block');
    reader.addEventListener('load', function () {
      $('#image').attr('src', this.result);
    })
    reader.readAsDataURL(file);
  }
  else {
    // validate_chg_color(this);
    document.getElementById('previewText').style.display = null;
    document.getElementById('image').style.display = null;
    document.getElementsByClassName('imgContainer')[0].style.border = null;
    $('#image').attr('src', '');
  }
})

//  **********    **********    **********    **********    **********



//  **********    **********    Genrating CV    **********    **********


function templateRadioSelector(ele) {
  for (let i = 0; i < $('#form3 .card').length; i++) {
    // $(`#form3 .card:nth-child(${i+1})`).css('border','1px solid rgba(0,0,0,.125)');
    $(`#form3 .card:nth-child(${i + 1})`).css('background-color', 'white');
  }
  // $(ele).css('border', '10px solid green');
  $(ele).css('background-color', '#80808088');
  $(ele).find('input').prop('checked', true);
}