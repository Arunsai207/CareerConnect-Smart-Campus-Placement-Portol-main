$(document).ready(function () {
    $('.t4 .one').css('border', '3px solid white');
    $('.t4 .pelement').click(function () {
        $('.t4 .pelement').css('border', '3px solid transparent');
        $(this).css('border', '3px solid white');
        $('.t4 .topbar').css('background-color', $(this).css('background-color'));
        $('.t4 .section h2').css('color', $(this).css('background-color'));
    });
});
