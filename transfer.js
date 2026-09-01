function template_selector() {
    if ($('#template_1').is(':checked')) {
        generateCV('Template_1');
    }
    else if ($('#template_2').is(':checked')) {
        generateCV('Template_2');
    }
    else if ($('#template_3').is(':checked')) {
        generateCV('Template_3');
    }
    else if ($('#template_4').is(':checked')) {
        generateCV('Template_4');
    }
    else {
        alert("Please select a template.");
    }
}

function visibler() {
    $(`.dwnldimage`).css('display', 'inline-block');
    $(`.printCv`).css('display', 'inline-block');
    $(`.back-to-form`).css('display', 'flex');
    $(`.palette`).css('display', 'block');
}
function printer() {
    $(`.dwnldimage`).css('display', 'none');
    $(`.printCv`).css('display', 'none');
    $(`.back-to-form`).css('display', 'none');
    $(`.palette`).css('display', 'none');
    window.print();
    setTimeout(visibler, 500);
}

document.querySelectorAll('.printCv').forEach(el => el.addEventListener('click', printer));

function generateCV(template) {
    document.querySelectorAll('.template').forEach((element) => {
        element.style.display = 'none';
    });
    const selectedTemplate = document.getElementById(template);
    if (!selectedTemplate) {
        alert('The selected resume template could not be loaded.');
        return;
    }
    document.querySelectorAll('form.step').forEach((form) => {
        form.classList.remove('active');
        form.style.display = 'none';
    });
    selectedTemplate.style.display = 'block';
    selectedTemplate.style.visibility = 'visible';
    selectedTemplate.style.opacity = '1';
    document.getElementById('nav').style.display = 'none';
    window.scrollTo(0, 0);

    visibler();


    //  **********    **********  Image(Resume) Download/ PDF   **********    **********    **********

    document.querySelector('#dwnldimage').addEventListener('click', function () {
        // let template2Image = document.getElementById(template).find('#target');
        let template2Image = $(`#${template}`).find('#target')[0];
        html2canvas(template2Image).then(function (canvas) {
            console.log(canvas);
            return Canvas2Image.saveAsPNG(canvas);
        });
    });

    

    //  **********    **********    **********    **********    **********


    //  **********      Profile Image       *********

    let fileInput = document.getElementById('inpImg');
    let file = fileInput && fileInput.files && fileInput.files[0];
    if (file) {
        let reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = function () {
            const imgEl = document.getElementById(`${template}`).getElementsByClassName('profilepic')[0];
            if (imgEl) imgEl.src = reader.result;
        };
    } else {
        // No uploaded image — leave default placeholder intact
    }

    //  **********    **********    **********    **********    **********



    // ************************************ First Form *******************************

    let dob = new Date($('#dob').val());
    $(`#${template} #t_name`).html($('#fname').val() + " " + $('#lname').val());
    $(`#${template} #t_gender`).html($('#gender').val());
    $(`#${template} #t_dob`).html(String(dob.getDate()).padStart(2, '0') + "/" + String(dob.getMonth() + 1).padStart(2, '0') + "/" + dob.getFullYear());
    $(`#${template} #t_email`).html($('#email').val());
    $(`#${template} #t_number`).html($('#number').val());
    $(`#${template} #t_address`).html($('#address').val() + "<br>" + $('#zip').val() + "<br>" + ($('#city').val() == null ? "" : $('#city').val() + ", ") + $('#state').val() + ", " + $('#country').val());

    if ($('#website').val().trim() == "") {
        $(`#${template} #t_website`).parent().css('display', 'none');
    }
    else {
        $(`#${template} #t_website`).html($('#website').val());
    }

    if ($('#linkedIn').val().trim() == "") {
        $(`#${template} #t_linkedIn`).parent().css('display', 'none');
    }
    else {
        $(`#${template} #t_linkedIn`).html($('#linkedIn').val());
    }

    //  **********    **********    **********    **********    **********



    // ************************ Second form *************************


    //  **********    Education    **********

    let edu_items = $('#accordionEdu .accordion-item').length;
    for (let i = 0; i < edu_items; i++) {
        let degree = $(`#accordionEdu .accordion-item:nth-child(${i + 1}) .degree`).val().trim();
        let srt_date = new Date($(`#accordionEdu .accordion-item:nth-child(${i + 1}) .edu_start`).val());
        srt_date = srt_date.getFullYear();

        let end_date = "";
        if ($(`#accordionEdu .accordion-item:nth-child(${i + 1}) .end_date_toggle`).prop('checked')) {
            end_date = 'Present';
        }
        else {
            end_date = new Date($(`#accordionEdu .accordion-item:nth-child(${i + 1}) .end_date`).val());
            end_date = end_date.getFullYear();
        }
        let school = $(`#accordionEdu .accordion-item:nth-child(${i + 1}) .school`).val().trim();
        // console.log(srt_date, end_date, degree, school);

        if (degree == "" || school == "" || srt_date == NaN || end_date == NaN) {
            continue;
        }

        if (template == "Template_1") {
            $('.t1 .left_side .education ul').append(`<li>
            <h5>${srt_date} - ${end_date}</h5>
            <h4>${degree}</h4>
            <h4>${school}</h4>
            </li>`);
        }
        else if (template == 'Template_2') {
            $('.t2 .lower_right .education .content').append(`
            <div class="con">
                <h4 class="time">${srt_date} - ${end_date}</h4>
                <h4 class="degree">${degree}</h4>
                <h4 class="uni">${school}</h4>
            </div>`)
        }
        else if (template == 'Template_3') {
            $('.t3 .left_side .education .content').append(`
            <div class="entry">
                <div class="meta"><span>${srt_date} - ${end_date}</span></div>
                <h4>${degree}</h4>
                <p>${school}</p>
            </div>`)
        }
        else if (template == 'Template_4') {
            $('.t4 .content-area .education .content').append(`
            <div class="entry">
                <div class="meta"><span>${srt_date} - ${end_date}</span></div>
                <h4>${degree}</h4>
                <p>${school}</p>
            </div>`)
        }
       
 
 
    }


    //  **********    Work    **********

    let work_items = $('#accordionWork .accordion-item').length;

    for (let i = 0; i < work_items; i++) {
        let job_title = $(`#accordionWork .accordion-item:nth-child(${i + 1}) .job_title`).val().trim();
        let company_name = $(`#accordionWork .accordion-item:nth-child(${i + 1}) .company_name`).val().trim();
        let srt_date = new Date($(`#accordionWork .accordion-item:nth-child(${i + 1}) .work_start`).val());
        srt_date = srt_date.getFullYear();

        let end_date = "";
        if ($(`#accordionWork .accordion-item:nth-child(${i + 1}) .end_date_toggle`).prop('checked')) {
            end_date = 'Present';
        }
        else {
            end_date = new Date($(`#accordionWork .accordion-item:nth-child(${i + 1}) .end_date`).val());
            end_date = end_date.getFullYear();
        }
        let work_desc = $(`#accordionWork .accordion-item:nth-child(${i + 1}) .work_desc`).val().trim();

        if (job_title == "" || company_name == "" || srt_date == NaN || end_date == NaN) {
            continue;
        }

        if (template == "Template_1") {
            $('.t1 .right_side .experience').append(
                `<div class="box">
                <div class="year_company">
                    <h5>${srt_date} - ${end_date}</h5>
                    <h5>${company_name}</h5>
                </div>
                <div class="text">
                    <h4>${job_title}</h4>
                    <p>${work_desc}</p>
                </div>
            </div>`
            )
        }
        else if (template == 'Template_2') {
            $('.t2 .lower_right .experience .content').append(`<div class="con">
            <div class="time"><h4>${srt_date}-${end_date}</h4><h4>${company_name}</h4></div>
            <div class="box"><div class="text">${job_title}</div><div class="exp">${work_desc}</div></div>
        </div>`)
        }
        else if (template == 'Template_3') {
            $('.t3 .right_side .experience .content').append(`
            <div class="entry">
                <div class="meta"><span>${srt_date} - ${end_date}</span><span>${company_name}</span></div>
                <h4>${job_title}</h4>
                <p>${work_desc}</p>
            </div>`)
        }
        else if (template == 'Template_4') {
            $('.t4 .content-area .experience .content').append(`
            <div class="entry">
                <div class="meta"><span>${srt_date} - ${end_date}</span><span>${company_name}</span></div>
                <h4>${job_title}</h4>
                <p>${work_desc}</p>
            </div>`)
        }
       
    }

    //  **********    Skills    **********

    let skill_items = $('#accordionSkill .accordion-item').length;
    for (let i = 0; i < skill_items; i++) {
        let skill = $(`#accordionSkill .accordion-item:nth-child(${i + 1}) .skill`).val().trim();

        if (skill == "") {
            continue;
        }
        if (template == "Template_1") {
            $('.t1 .right_side .skills .box').append(`<h4>${skill}</h4>`);
        }
        else if (template == 'Template_2') {
            $('.t2 .lower .lower_left .skills .content').append(`<div class="skill">${skill}</div>`)
        }
        else if (template == 'Template_3') {
            $('.t3 .left_side .skills .list').append(`<span>${skill}</span>`)
        }
        else if (template == 'Template_4') {
            $('.t4 .sidebar .skills .list').append(`<span>${skill}</span>`)
        }
        
    }


    //  **********    Interest    **********

    let interest_items = $('#accordionInt .accordion-item').length;
    for (let i = 0; i < interest_items; i++) {
        let interest = $(`#accordionInt .accordion-item:nth-child(${i + 1}) .hobby`).val().trim();

        if (interest == "") {
            continue;
        }

        if (template == "Template_1") {
            $('.t1 .right_side .interest ul').append(`
            <li>${interest}</li>`);
        }
        else if (template == 'Template_2') {
            $('.t2 .lower .lower_left .interests .content').append(`<div class="con">${interest}</div>`);
        }
        else if (template == 'Template_3') {
            $('.t3 .right_side .interests .list').append(`<span>${interest}</span>`)
        }
        else if (template == 'Template_4') {
            $('.t4 .sidebar .interests .list').append(`<span>${interest}</span>`)
        }
       
    }

   

    //  **********    Languages    **********

    let lang_items = $('#accordionLang .accordion-item').length;
    for (let i = 0; i < lang_items; i++) {
        let lang = $(`#accordionLang .accordion-item:nth-child(${i + 1}) .lang`).val().trim();

        if (lang == "") {
            continue;
        }

        if (template == "Template_1") {
            $('.t1 .left_side .language ul').append(`<li><span class="text">${lang}</span></li>`);
        }
        else if (template == 'Template_2') {
            $('.t2 .lower .lower_left .languages .content .con').append(`<div class="lang">${lang}</div>`);
        }
        else if (template == 'Template_3') {
            $('.t3 .right_side .languages .list').append(`<span>${lang}</span>`)
        }
        else if (template == 'Template_4') {
            $('.t4 .sidebar .languages .list').append(`<span>${lang}</span>`)
        }
       
    }


    //  **********    Archievements    **********

    // let achv = $(`#achv_description`).val().trim();
    let achv = $(`#achv_description`).val().replaceAll("\n", "<br />\r\n");

    if (achv !== "") {
        if (template == "Template_1") {
            $('.t1 .right_side .achievements').append(`<p>${achv}</p>`);
        }
        else if (template == 'Template_2') {
            $('.t2 .lower_right .achievements .content .con').append(`<div class="val">${achv}</div>`)
        }
        else if (template == 'Template_3') {
            $('.t3 .right_side .achievements .content').append(`<div class="entry"><p>${achv}</p></div>`)
        }
        else if (template == 'Template_4') {
            $('.t4 .content-area .achievements .content').append(`<div class="entry"><p>${achv}</p></div>`)
        }
       
    }


    //  **********    **********    **********    **********    **********

    // ******************* Profile *****************8**

    let profile = $(`#profile`).val().replaceAll("\n", "<br />\r\n");
    if (profile !== "") {
        if (template == "Template_1") {
            $('.t1 .right_side .prof').append(`<p>${profile}</p>`);
        }
        else if (template == 'Template_2') {
            $('.t2 .lower_right .profile').append(`<div class="content">${profile}</div>`)
        }
        else if (template == 'Template_3') {
            $('.t3 .right_side .profile .content').append(`<div class="entry"><p>${profile}</p></div>`)
        }
        else if (template == 'Template_4') {
            $('.t4 .content-area .profile .content').append(`<div class="entry"><p>${profile}</p></div>`)
        }
        
    }

    //  **********    **********    **********    **********    **********
}