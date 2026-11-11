// CPUwiser Docs Navigation and Interactive Diagrams

document.addEventListener('DOMContentLoaded', () => {
  // Mobile menu toggle if button exists
  const menuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.querySelector('.sidebar');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  // Active anchor link highlighting based on current path
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.sidebar-item a, .nav-link');
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href && (currentPath.endsWith(href) || (href === 'index.html' && (currentPath.endsWith('/') || currentPath.endsWith('index.html'))))) {
      link.parentElement.classList.add('active');
    }
  });

  // Interactive diagram hover tooltips or highlight effects
  const diagramNodes = document.querySelectorAll('.diagram-node');
  diagramNodes.forEach(node => {
    node.addEventListener('mouseenter', () => {
      node.style.filter = 'drop-shadow(0 0 12px rgba(56, 189, 248, 0.45))';
    });
    node.addEventListener('mouseleave', () => {
      node.style.filter = 'none';
    });
  });
});

